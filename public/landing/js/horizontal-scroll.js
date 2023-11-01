const scrolls = document.getElementsByClassName("horizontal-scroll");

for (let i = 0, len = scrolls.length; i < len; i++) {
    let isDown = false;
    let startX;
    let scrollLeft;

    scrolls[i].addEventListener("mousedown", e => {
        isDown = true;
        scrolls[i].classList.add("active");
        startX = e.pageX - scrolls[i].offsetLeft;
        scrollLeft = scrolls[i].scrollLeft;
    });
    scrolls[i].addEventListener("mouseleave", () => {
        isDown = false;
        scrolls[i].classList.remove("active");
    });
    scrolls[i].addEventListener("mouseup", () => {
        isDown = false;
        scrolls[i].classList.remove("active");
    });
    scrolls[i].addEventListener("mousemove", e => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - scrolls[i].offsetLeft;
        const walk = (x - startX) * 3;
        scrolls[i].scrollLeft = scrollLeft - walk;
    });
}
