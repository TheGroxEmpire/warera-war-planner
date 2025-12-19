SKILL_NAMES = ["Attack", "Precision", "Crit. Chance", "Crit. Dmg", "Armor", "Dodge", "Health", "Hunger"]

document.addEventListener("DOMContentLoaded", () => {
    const levelSlider = document.getElementById("level-slider");
    const levelInput = document.getElementById("level-input");
    const companiesSlider = document.getElementById("companies-slider");
    const companiesInput = document.getElementById("companies-input");
    const rankBonusSlider = document.getElementById("rank_bonus-slider");
    const rankBonusInput = document.getElementById("rank_bonus-input");
    const resultsDiv = document.getElementById("results");

    let allBuilds = [];

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

    rankBonusSlider.addEventListener("input", () => {
        rankBonusInput.value = rankBonusSlider.value;
    });

    rankBonusInput.addEventListener("input", () => {
        rankBonusSlider.value = rankBonusInput.value;
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
        const trendsDiv = document.getElementById("trends");
        const optimizeBtn = form.querySelector(".optimize-btn"); 

        trendsDiv.innerHTML = "";
        resultsDiv.innerHTML = "";

        optimizeBtn.disabled = true;
        optimizeBtn.innerHTML = `<span class="spinner"></span><span>OPTIMIZING</span>`;

        try {
            const response = await fetch("/optimize", {
                method: "POST",
                body: data,
            });

            const results = await response.json();
            allBuilds = results.builds;
            trendsDiv.innerHTML = results.trends;

            if (allBuilds && allBuilds.length > 0) {
                renderBuilds(allBuilds);
            } else {
                resultsDiv.innerHTML = "<p>No optimal builds found.</p>";
            }

        } finally {
            optimizeBtn.disabled = false;
            optimizeBtn.innerHTML = "Optimize";
        }
    });

    function renderBuilds(builds) {
        resultsDiv.innerHTML = "";
        builds.forEach(d => {
            let skillsHtml = "";
            for (let i = 0; i < d.skill_lvls.length; i++) {
                skillsHtml += `<div class='skill'><svg><use xlink:href='#skill-svg-${i+1}'></use></svg>${d.skill_lvls[i]}<span class='skill-name'>${SKILL_NAMES[i]}</span></div>`;
            }

            let gearHtml = "";
            d.gear.forEach(g => {
                gearHtml += `<div class='gear-item' style='background-color: ${g.color}'><img src='/static/images/${g.image_name}.png' alt='${g.slot}'></div>`;
            });

            const buildHtml = `
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
            resultsDiv.innerHTML += buildHtml;
        });
    }
});
