const SKILL_NAMES = ["Attack", "Precision", "Crit. Chance", "Crit. Dmg", "Armor", "Dodge", "Health", "Hunger"];

// const FILTER_CONFIGS = {
//     cost_per_k:   { min: 0,       max: 5,       step: 0.1,    default: 2.5,     label: 'Cost / K Target',  fmt: v => parseFloat(v).toFixed(2) },
//     total_damage: { min: 100000,  max: 5000000, step: 100000, default: 1000000, label: 'Damage Target',    fmt: v => (v/1000000).toFixed(2) + 'M' },
//     net_cost:     { min: 50,      max: 5000,    step: 50,     default: 500,     label: 'Net Cost Target',  fmt: v => parseFloat(v).toFixed(0) },
// };

document.addEventListener("DOMContentLoaded", () => {
    const resultsDiv = document.getElementById("results");
    const buildForm = document.getElementById("build-form");
    const optimizeBtn = buildForm.querySelector(".optimize-btn");

    let allBuilds = [];
    // let cachedAllBuilds = []; // removed: no client-side re-filtering

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
    syncSliderAndInput("rank_bonus-slider", "rank_bonus-input");
    syncSliderAndInput("battle_bonus-slider", "battle_bonus-input");

    // Filter tabs/slider/button removed — server returns fixed 19+1 builds

    // --- Dev Mode Toggle ---
    const devModeToggle = document.getElementById('dev-mode-toggle');
    const devModeInput = document.getElementById('dev-mode-input');
    if (devModeToggle) {
        devModeToggle.addEventListener('click', function() {
            this.classList.toggle('active');
            const isOn = this.classList.contains('active');
            devModeInput.value = isOn ? 'on' : 'off';
            saveFormState();
        });
    }

    // --- Form Submission ---
    let isOptimizing = false;

    buildForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (isOptimizing) return;

        const data = new FormData(buildForm);

        resultsDiv.innerHTML = "";
        optimizeBtn.disabled = true;
        optimizeBtn.innerHTML = `<span class="spinner"></span><span>OPTIMIZING</span>`;
        isOptimizing = true;

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

            renderBuilds(allBuilds);

        } catch (error) {
            console.error("Optimization error:", error);
            resultsDiv.innerHTML = `<p class="error">An error occurred during optimization. Please try again later.</p>`;
        } finally {
            optimizeBtn.disabled = false;
            optimizeBtn.innerHTML = 'Optimize<span class="tooltip">Runs NSGA-II multi-objective optimization to find builds that balance damage vs. cost.</span>';
            isOptimizing = false;
        }
    });

    // --- localStorage Persistence ---
    function saveFormState() {
        localStorage.setItem('wbt_level', document.getElementById('level-input').value);
        localStorage.setItem('wbt_rank_bonus', document.getElementById('rank_bonus-input').value);
        localStorage.setItem('wbt_battle_bonus', document.getElementById('battle_bonus-input').value);
        localStorage.setItem('wbt_companies', document.getElementById('companies').value);
        localStorage.setItem('wbt_pill', document.getElementById('pill').checked);
        localStorage.setItem('wbt_dev_mode', document.getElementById('dev-mode-input').value);
    }

    function restoreFormState() {
        const level = localStorage.getItem('wbt_level');
        if (level) {
            document.getElementById('level-input').value = level;
            document.getElementById('level-slider').value = level;
        }

        const rankBonus = localStorage.getItem('wbt_rank_bonus');
        if (rankBonus) {
            document.getElementById('rank_bonus-input').value = rankBonus;
            document.getElementById('rank_bonus-slider').value = rankBonus;
        }

        const battleBonus = localStorage.getItem('wbt_battle_bonus');
        if (battleBonus) {
            document.getElementById('battle_bonus-input').value = battleBonus;
            document.getElementById('battle_bonus-slider').value = battleBonus;
        }

        const companies = localStorage.getItem('wbt_companies');
        if (companies) document.getElementById('companies').value = companies;

        const pill = localStorage.getItem('wbt_pill');
        if (pill !== null) document.getElementById('pill').checked = pill === 'true';

        const devMode = localStorage.getItem('wbt_dev_mode');
        if (devMode) {
            document.getElementById('dev-mode-input').value = devMode;
            const toggle = document.getElementById('dev-mode-toggle');
            if (devMode === 'on') toggle.classList.add('active');
            else toggle.classList.remove('active');
        }

        // Re-trigger slider backgrounds after restoring values
        ['level', 'rank_bonus', 'battle_bonus'].forEach(id => {
            document.getElementById(`${id}-slider`).dispatchEvent(new Event('input'));
        });
    }

    buildForm.addEventListener('input', saveFormState);
    buildForm.addEventListener('change', saveFormState);

    restoreFormState();

    // selectBuildsFromCache removed — server always returns 19+1 builds

    // --- Render Builds ---
    function renderBuilds(builds) {
        if (!builds || builds.length === 0) {
            resultsDiv.innerHTML = "<p>No optimal builds found. Please adjust your parameters and try again.</p>";
            return;
        }

        resultsDiv.innerHTML = builds.map(d => {
            const skillsHtml = d.skill_lvls.map((level, i) => {
                const statVal = d.diag && d.diag.skill_stats ? d.diag.skill_stats[i] : null;
                let tooltipText = SKILL_NAMES[i];
                if (statVal !== null) {
                    const isPct = i >= 1 && i <= 3;  // Precision, Crit.Chance, Crit.Dmg are %
                    if (i === 4 || i === 5) {  // Armor or Dodge
                        const devMode = devModeInput ? devModeInput.value : 'off';
                        const stat = Number(statVal);
                        if (devMode === 'on') {
                            const k = 40;
                            const pct = (stat / (stat + k) * 100).toFixed(1);
                            tooltipText += `: ${stat.toFixed(1)} (${pct}%)`;
                        } else {
                            const pct = i === 4 ? Math.min(90, stat) : stat;  // armor capped at 90%
                            tooltipText += `: ${pct.toFixed(0)}%`;
                        }
                    } else {
                        tooltipText += `: ${Number(statVal).toFixed(isPct ? 0 : 1)}${isPct ? '%' : ''}`;
                    }
                }
                return `
                    <div class='skill'>
                        <svg><use xlink:href='#skill-svg-${i + 1}'></use></svg>
                        ${level}
                        <span class='skill-name'>${tooltipText}</span>
                    </div>
                `;
            }).join("");

            const gearHtml = d.gear.map(g => `
                <div class='gear-item' style='background-color: ${g.color}'>
                    <img src='/static/images/${g.image_name}.png' alt='${g.slot}'>
                    <span class='quantity-label'>x ${(Number(g.quantity)*100).toFixed(0)} %</span>
                </div>
            `).join("");

            const cardClass = d.is_highest_damage ? " highest-damage-card" : (d.is_max_damage ? " max-damage-card" : "");
            return `
                <div class='card${cardClass}'>
                    <div class='card-damage'>${d.total_damage_formatted} DMG<span class='damage-label'>Average daily damage</span></div>
                    <div class='card-cost'><div class='cost-left'><svg stroke='currentColor' fill='currentColor' stroke-width='0' viewBox='0 0 24 24' height='1em' width='1em' xmlns='http://www.w3.org/2000/svg' style='width: 1em; height: 1em; paint-order: stroke; stroke-linecap: round; stroke-linejoin: round;'><path d='M12 5C7.031 5 2 6.546 2 9.5S7.031 14 12 14c4.97 0 10-1.546 10-4.5S16.97 5 12 5zm-5 9.938v3c1.237.299 2.605.482 4 .541v-3a21.166 21.166 0 0 1-4-.541zm6 .54v3a20.994 20.994 0 0 0 4-.541v-3a20.994 20.994 0 0 1-4 .541zm6-1.181v3c1.801-.755 3-1.857 3-3.297v-3c0 1.44-1.199 2.542-3 3.297zm-14 3v-3C3.2 13.542 2 12.439 2 11v3c0 1.439 1.2 2.542 3 3.297z'></path></svg><span class='net-cost-value'>${d.net_cost_formatted}</span><div class='cost-label'>Daily net cost<div class='cost-breakdown'><span class='cost-line negative'>- ${d.total_cost_formatted} gear and consumables</span><span class='cost-line positive'>+ ${d.monetary_value_from_scrap_formatted} from scrap</span><span class='cost-line positive'>+ ${d.case_value_formatted} from ${d.cases_per_day_formatted} cases</span></div></div></div><span class='card-efficiency'>${(d.net_cost / d.total_damage * 1000).toFixed(2)} $/K<span class='efficiency-label'>Net cost per 1K damage</span></span></div>
                    <div class='card-skills'>
                        <h3>Skills</h3>
                        <div class='skills-grid'>${skillsHtml}</div>
                    </div>
                    <div class='card-items'>
                        <h3>Gear &amp; Consumables</h3>
                        <div class='items-grid'>
                            ${gearHtml}
                            <div class='gear-item' style='background-color: ${d.ammo_color}'>
                                <img src='/static/images/${d.ammo_name}.png' alt='${d.ammo_name}'>
                                <span class='quantity-label'>${d.ammo_quantity}</span>
                            </div>
                            <div class='gear-item' style='background-color: ${d.food_color}'>
                                <img src='/static/images/${d.food_name}.png' alt='${d.food_name}'>
                                <span class='quantity-label'>${d.food_quantity}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join("");
    }
});
