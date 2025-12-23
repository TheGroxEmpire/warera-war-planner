const SKILL_NAMES = ["Attack", "Precision", "Crit. Chance", "Crit. Dmg", "Armor", "Dodge", "Health", "Hunger"];

document.addEventListener("DOMContentLoaded", () => {
    const resultsDiv = document.getElementById("results");
    const trendsDiv = document.getElementById("trends");
    const buildForm = document.getElementById("build-form");
    const optimizeBtn = buildForm.querySelector(".optimize-btn");

    let allBuilds = [];

    // --- Slider and Input Synchronization ---
    const syncSliderAndInput = (sliderId, inputId) => {
        const slider = document.getElementById(sliderId);
        const input = document.getElementById(inputId);

        const updateSliderBackground = () => {
            const value = (slider.value - slider.min) / (slider.max - slider.min) * 100;
            slider.style.background = `linear-gradient(to right, rgb(160, 0, 0) ${value}%, #333 ${value}%)`;
        };

        slider.addEventListener("input", () => {
            input.value = slider.value;
            updateSliderBackground();
        });

        input.addEventListener("input", () => {
            slider.value = input.value;
            updateSliderBackground();
        });

        updateSliderBackground(); // Initial update
    };

    syncSliderAndInput("level-slider", "level-input");
    syncSliderAndInput("companies-slider", "companies-input");
    syncSliderAndInput("rank_bonus-slider", "rank_bonus-input");

    // --- Toggle Buttons ---
    document.querySelectorAll(".toggle-btn").forEach(button => {
        button.addEventListener("click", () => {
            const input = document.getElementById(`${button.dataset.name}-input`);
            input.value = (input.value === "on") ? "off" : "on";
            button.classList.toggle("active");
        });
    });

    // --- Form Submission ---
    buildForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(buildForm);

        trendsDiv.innerHTML = "";
        resultsDiv.innerHTML = "";
        optimizeBtn.disabled = true;
        optimizeBtn.innerHTML = `<span class="spinner"></span><span>OPTIMIZING</span>`;

        try {
            const response = await fetch("/optimize", {
                method: "POST",
                body: data,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const results = await response.json();
            allBuilds = results.builds;
            trendsDiv.innerHTML = results.trends;

            if (allBuilds && allBuilds.length > 0) {
                renderBuilds(allBuilds);
            } else {
                resultsDiv.innerHTML = "<p>No optimal builds found. Please adjust your parameters and try again.</p>";
            }

        } catch (error) {
            console.error("Optimization error:", error);
            resultsDiv.innerHTML = `<p class="error">An error occurred during optimization. Please try again later.</p>`;
        } finally {
            optimizeBtn.disabled = false;
            optimizeBtn.innerHTML = "Optimize";
        }
    });

    // --- Render Builds ---
    function renderBuilds(builds) {
        resultsDiv.innerHTML = builds.map(d => {
            const skillsHtml = d.skill_lvls.map((level, i) => `
                <div class='skill'>
                    <svg><use xlink:href='#skill-svg-${i + 1}'></use></svg>
                    ${level}
                    <span class='skill-name'>${SKILL_NAMES[i]}</span>
                </div>
            `).join("");

            const gearHtml = d.gear.map(g => `
                <div class='gear-item' style='background-color: ${g.color}'>
                    <img src='/static/images/${g.image_name}.png' alt='${g.slot}'>
                </div>
            `).join("");

            return `
                <div class='card'>
                    <div class='card-damage'>${d.total_damage_formatted} DMG<span class='damage-label'>Average daily damage</span></div>
                    <div class='card-cost'><svg stroke='currentColor' fill='currentColor' stroke-width='0' viewBox='0 0 24 24' height='1em' width='1em' xmlns='http://www.w3.org/2000/svg' style='width: 1em; height: 1em; paint-order: stroke; stroke-linecap: round; stroke-linejoin: round;'><path d='M12 5C7.031 5 2 6.546 2 9.5S7.031 14 12 14c4.97 0 10-1.546 10-4.5S16.97 5 12 5zm-5 9.938v3c1.237.299 2.605.482 4 .541v-3a21.166 21.166 0 0 1-4-.541zm6 .54v3a20.994 20.994 0 0 0 4-.541v-3a20.994 20.994 0 0 1-4 .541zm6-1.181v3c1.801-.755 3-1.857 3-3.297v-3c0 1.44-1.199 2.542-3 3.297zm-14 3v-3C3.2 13.542 2 12.439 2 11v3c0 1.439 1.2 2.542 3 3.297z'></path></svg> ${d.total_cost_formatted}<span class='cost-label'>Total daily cost</span></div>
                    <div class='card-sections'>
                        <div class='card-skills'>
                            <h3>Skills</h4>
                            <div class='skills-grid'>${skillsHtml}</div>
                        </div>
                        <div class='card-consumables'>
                            <h3>Consumables</h4>
                            <div class='consumables-grid'>
                                <div class='consumable-item' style='background-color: ${d.ammo_color}'><img src='/static/images/${d.ammo_name}.png' alt='${d.ammo_name}'></div>
                                <div class='consumable-item' style='background-color: ${d.food_color}'><img src='/static/images/${d.food_name}.png' alt='${d.food_name}'></div>
                            </div>
                        </div>
                    </div>
                    <h3>Gear</h4>
                    <div class='gear-grid'>${gearHtml}</div>
                </div>
            `;
        }).join("");
    }
});
