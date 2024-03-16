function handleLandingLeaving() {
    sendNoBounceEvent();
}

let isNoBounceSent = false;
function sendNoBounceEvent() {
    if (!isNoBounceSent) {
        try {
            if (window.gtag) {
                window.gtag(["event", "no_bounce"]);
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.log(e, "Failed to send gtag no_bounce event");
        }

        try {
            if (window.mixpanel) {
                window.mixpanel.track("no_bounce");
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.log(e, "Failed to send mixpanel no_bounce event");
        }
        isNoBounceSent = true;
    }
}

setTimeout(sendNoBounceEvent, 15000);
