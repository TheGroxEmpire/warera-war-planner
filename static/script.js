document.querySelectorAll(".toggle-btn").forEach(button => {
    button.addEventListener("click", () => {
        const input = document.getElementById(`${button.dataset.name}-input`);
        if (input.value === "on") {
            input.value = "off";
            button.classList.remove("active");
        } else {
            input.value = "on";
            button.classList.add("active");
        }
    });
});

document.getElementById("build-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    const resultsDiv = document.getElementById("results");
    const trendsDiv = document.getElementById("trends");
    resultsDiv.innerHTML = "Optimizing... Thank you for your patience.";
    trendsDiv.innerHTML = "";

    const response = await fetch("/optimize", {
        method: "POST",
        body: data,
    });

    const results = await response.json();
    resultsDiv.innerHTML = results.builds;
    trendsDiv.innerHTML = results.trends;
});

document.getElementById("results").addEventListener("click", (event) => {
    const card = event.target.closest(".card");
    if (card) {
        const content = card.querySelector(".card-content");
        if (content) {
            content.style.display = content.style.display === "block" ? "none" : "block";
        }
    }
});
