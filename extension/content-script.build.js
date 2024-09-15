let browser = chrome; // TODO: use polyfill

let script = document.createElement("script");
script.setAttribute("async", "false");
script.setAttribute("type", "text/javascript");
script.setAttribute("src", browser.runtime.getURL("nostr-provider.js"));
document.head.appendChild(script);
