communicator = require("./communicator");

global.XMLHttpRequest = require("xhr2");

window.nostr = {
    _pubkey: null,
    _groupId: null,

    async _ensureKeysAreCached() {
        if (this._pubkey && this._groupId) {
            return;
        }
        const keys = await communicator.getGroupKeys();
        this._pubkey = keys.pubkey;
        this._groupId = keys.groupId;
    },

    async getPublicKey() {
        console.log("getPublicKey() has been just called");
        await this._ensureKeysAreCached();
        return this._pubkey;
    },

    async signEvent(event) {
        console.log("signEvent() has just been called");
        await this._ensureKeysAreCached();
        return communicator.signEvent(event, this._groupId);
    },

    // TODO: fetch these from Bridge Controller OR let the user configure it in the extension directly
    async getRelays() {
        console.log("GET RELAYS CALLED");
        return {
            "wss://relay.damus.io": { read: true, write: true },
        };
    },
};
