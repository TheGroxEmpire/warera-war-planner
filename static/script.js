document.addEventListener("DOMContentLoaded", () => {
    const levelSlider = document.getElementById("level-slider");
    const levelInput = document.getElementById("level-input");
    const companiesSlider = document.getElementById("companies-slider");
    const companiesInput = document.getElementById("companies-input");

    levelSlider.addEventListener("input", () => {
        levelInput.value = levelSlider.value;
    });

    levelInput.addEventListener("input", () => {
        levelSlider.value = levelInput.value;
    });

    companiesSlider.addEventListener("input", () => {
        companiesInput.value = companiesSlider.value;
    });

    companiesInput.addEventListener("input", () => {
        companiesSlider.value = companiesInput.value;
    });

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
        const optimizeBtn = form.querySelector(".optimize-btn"); 

        trendsDiv.innerHTML = "";

        optimizeBtn.disabled = true;
        optimizeBtn.innerHTML = `<span class="spinner"></span><span>OPTIMIZING</span>`;

        try {
            const response = await fetch("/optimize", {
                method: "POST",
                body: data,
            });

            const results = await response.json();
            resultsDiv.innerHTML = results.builds;
            trendsDiv.innerHTML = results.trends;
        } finally {
            optimizeBtn.disabled = false;
            optimizeBtn.innerHTML = "Optimize";
        }
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
});
