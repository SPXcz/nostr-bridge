const {
    GroupsRequest,
    KeyType,
    Task,
    ProtocolType,
    SignRequest,
    TaskRequest,
} = require("./meesign_pb.js");
const { MeeSignPromiseClient } = require("./meesign_grpc_web_pb.js");
const { validateEvent, verifySignature, getEventHash } = require("nostr-tools");

// TODO: fetch instance from Bridge Controller when supported
const MEESIGN_SERVER_URL = "http://localhost:8080";
const SIGNATURE_RETRIEVAL_TIMEOUT_MS = 60000;

// FIXME(BUG): MeeSign clients may have some issues with serialization of FROST keys/signatures
//             as the retrieved values follow the form of the binary value encoded in hex
//             along with a trailing and a leading quote
const removeQuotesFromHex = (dirty) => {
    if (dirty[0] !== '"' || dirty.slice(-1) !== '"') {
        throw new Error("Hex string doesn't contain redundant quotes");
    }
    return dirty.slice(1, -1);
};

const removeParityByteFromHexPoint = (point) => {
    if (point[0] !== "0" || !(point[1] === "2" || point[1] === "3")) {
        return point;
    }

    return point.slice(2);
};

const formatReceivedPublicKey = (pubkeyBase64) => {
    let pubkeyHexWithQuotes = atob(pubkeyBase64);
    let pubkeyHex = removeQuotesFromHex(pubkeyHexWithQuotes);
    if (pubkeyHex.length !== (1 + 32) * 2) {
        throw new Error(
            `Invalid pubkey length: got ${pubkeyHex.length}B, expected 33B`
        );
    }
    let xCoordinate = removeParityByteFromHexPoint(pubkeyHex);
    console.assert(xCoordinate.length === 2 * 32);
    console.log("Pubkey: " + xCoordinate);
    return xCoordinate;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getEventDescription = (event) => {
    switch (event.kind) {
        case 0:
            return "user metadata (0)";
        case 1:
            return `short text note (1) - "${event.content}"`;
        case 2:
            return "recommend relay (2)"; // deprecated
        case 3:
            return "follows (3)";
        case 4:
            return "encrypted direct messages (4)";
        case 5:
            return "event deletion request (5)";
        case 6:
            return "repost (6)";
        case 7:
            return `reaction (7) - ${event.content}`;
        case 8:
            return "badge award (8)";
        case 9:
            return "group chat message (9)";
        case 10:
            return "group chat threaded reply (10)";
        case 11:
            return "group thread (11)";
        case 12:
            return "group thread reply (12)";
        case 13:
            return "seal (13)";
        case 14:
            return "direct message (14)";
        case 16:
            return "generic repost (16)";
        case 17:
            return "reaction to a website (17)";
        case 40:
            return "channel creation (40)";
        case 41:
            return "channel metadata (41)";
        case 42:
            return "channel message (42)";
        case 43:
            return "channel hide message (43)";
        case 44:
            return "channel mute user (44)";
        case 64:
            return "chess (pgn) (64)";
        case 818:
            return "merge requests (818)";
        case 1021:
            return "bid (1021)";
        case 1022:
            return "bid confirmation (1022)";
        case 1040:
            return "opentimestamps (1040)";
        case 1059:
            return "gift wrap (1059)";
        case 1063:
            return "file metadata (1063)";
        case 1311:
            return "live chat message (1311)";
        case 1617:
            return "patches (1617)";
        case 1621:
            return "issues (1621)";
        case 1622:
            return "replies (1622)";
        case 1630:
        case 1631:
        case 1632:
        case 1633:
            return "status (1630-1633)";
        case 1971:
            return "problem tracker (1971)";
        case 1984:
            return "reporting (1984)";
        case 1985:
            return "label (1985)";
        case 2003:
            return "torrent (2003)";
        case 2004:
            return "torrent comment (2004)";
        case 2022:
            return "coinjoin pool (2022)";
        case 4550:
            return "community post approval (4550)";
        default:
            return `unknown kind (${kind})`;
    }
};

// TODO: come up with a better way of creating authorization requests. The most important thing
//       is to enable the user to authenticate the request by validating the relevant parts.
//       E.g., a user follow request should contain their public key (and possibly their username),
//       a post reaction must contain the post identifier and the reaction itself, etc.
const createTaskName = (event) => {
    let kindMessage = getEventDescription(event);
    return `Nostr ${kindMessage}`;
};

// FIXME: don't search for 'nostr' substring, use proper configuration
//        either using the extension itself, or Bridge Configurator
const filterNostrGroups = (groups) =>
    groups.filter(
        (group) =>
            group.getKeyType() === KeyType.SIGNCHALLENGE &&
            group.getProtocol() === ProtocolType.MUSIG2 //&&
            // group.getName().toLowerCase().includes("nostr")
    );

export const getGroupKeys = async () => {
    var client = new MeeSignPromiseClient(MEESIGN_SERVER_URL);
    var request = new GroupsRequest();

    let allGroups = (await client.getGroups(request, {})).getGroupsList();

    if (allGroups.length === 0) {
        throw new Error("No groups found in Meesign");
    }

    let nostrGroups = filterNostrGroups(allGroups);
    if (nostrGroups.length === 0) {
        throw new Error("No nostr groups found");
    }
    let selectedGroup = nostrGroups.slice(-1).pop();
    // TODO: Consider working with Uint8Arrays, though they are not supported on all browsers
    let groupId = selectedGroup.getIdentifier_asB64();
    let pubkeyHex = formatReceivedPublicKey(groupId);
    let result = {
        pubkey: pubkeyHex,
        groupId: groupId,
    };
    return result;
};

const formatReceivedSignature = (signatureBase64) => {
    var signature = atob(signatureBase64);
    signature = removeQuotesFromHex(signature);
    signature = removeParityByteFromHexPoint(signature);
    if (signature.length != 64 * 2) {
        throw new Error("Invalid signature length");
    }

    console.log("Signature: " + signature);

    return signature;
};

const fetchEventSignature = async (client, taskId) => {
    var getTaskRequest = new TaskRequest();
    getTaskRequest.setTaskId(taskId);
    for (
        var attempt = 0;
        attempt < SIGNATURE_RETRIEVAL_TIMEOUT_MS / 1000;
        attempt++
    ) {
        await sleep(1000);

        let response = await client.getTask(getTaskRequest, {});
        let currentTaskState = response.getState();
        if (
            currentTaskState == Task.TaskState.CREATED ||
            currentTaskState == Task.TaskState.RUNNING
        ) {
            continue;
        }
        if (currentTaskState == Task.TaskState.FAILED) {
            throw new Error("MeeSign task was rejected/failed");
        }
        console.assert(currentTaskState == Task.TaskState.FINISHED);

        return response.getDataList_asB64()[0];
    }
    throw new Error(
        `Task didn't finish within ${SIGNATURE_RETRIEVAL_TIMEOUT_MS} ms.`
    );
};

const hexStringToUint8Array = (hexString) => {
    if (hexString.length % 2 !== 0) {
        throw "Invalid hexString";
    }
    var arrayBuffer = new Uint8Array(hexString.length / 2);

    for (var i = 0; i < hexString.length; i += 2) {
        var byteValue = parseInt(hexString.substr(i, 2), 16);
        if (isNaN(byteValue)) {
            throw "Invalid hexString";
        }
        arrayBuffer[i / 2] = byteValue;
    }

    return arrayBuffer;
}

export const signEvent = async (event, groupId) => {
    event.created_at = Math.floor(Date.now() / 1000);

    const pubkeyHex = formatReceivedPublicKey(groupId);
    event.pubkey = pubkeyHex;
    let eventId = getEventHash(event);
    console.log("EventId: " + eventId);
    event.id = eventId;

    var client = new MeeSignPromiseClient(MEESIGN_SERVER_URL);
    var request = new SignRequest();
    request.setName(createTaskName(event));
    request.setGroupId(groupId);
    request.setData(hexStringToUint8Array(eventId));

    let response = await client.sign(request, {});
    let taskId = response.getId();

    let signature = await fetchEventSignature(client, taskId);
    event.sig = formatReceivedSignature(signature);

    if (!validateEvent(event)) {
        console.log("Event is not valid!");
    }
    if (!verifySignature(event)) {
        console.log("Signature is not valid!");
    }
    return event;
};
