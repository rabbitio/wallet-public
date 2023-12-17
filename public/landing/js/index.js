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

document.addEventListener("DOMContentLoaded", () => {
    // eslint-disable-next-line no-undef
    new Splide(".splide").mount().on("visible", () => {
        const slidesIndexes = [1, 2, 3, 4];
        slidesIndexes.forEach(slideIndex => {
            const textElement = document.getElementById("slide-text-" + slideIndex);
            if (document.getElementById("splide01-slide0" + slideIndex).className.includes("is-visible")) {
                textElement.style.display = "inline";
            } else {
                textElement.style.display = "none";
            }
        });
    });
});
