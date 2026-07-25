(function (global, factory) {
    "use strict";

    const api = factory(global);
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    global.WareraProfileImport = api;
}(typeof window !== "undefined" ? window : globalThis, function (global) {
    "use strict";

    const API_BASE_URL = "https://api2.warera.io/trpc";
    const MAX_SEARCH_RESULTS = 8;
    const SKILL_KEYS = [
        "attack",
        "precision",
        "criticalChance",
        "criticalDamages",
        "armor",
        "dodge",
        "health",
        "hunger",
        "lootChance",
    ];
    const GEAR_SLOTS = ["weapon", "helmet", "gloves", "chest", "pants", "boots"];
    const WEAPON_TIER_BY_CODE = {
        knife: 1,
        pistol: 2,
        gun: 2,
        rifle: 3,
        sniper: 4,
        tank: 5,
        jet: 6,
    };
    const AMMO_TIER_BY_CODE = {
        green: 1,
        lightammo: 1,
        blue: 2,
        ammo: 2,
        purple: 3,
        heavyammo: 3,
    };

    function boundedInteger(value, minValue, maxValue, fallback) {
        const parsed = finiteNumber(value);
        if (parsed === null) return fallback;
        return Math.min(maxValue, Math.max(minValue, Math.round(parsed)));
    }

    function finiteNumber(value) {
        if (typeof value !== "number" && typeof value !== "string") return null;
        if (value === null || value === undefined) return null;
        if (typeof value === "string" && !value.trim()) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function isIntegerInRange(value, minValue, maxValue) {
        return value !== null
            && Number.isInteger(value)
            && value >= minValue
            && value <= maxValue;
    }

    function safeAvatarUrl(value) {
        const raw = typeof value === "string" ? value.trim() : "";
        if (!raw) return "";
        try {
            const url = new URL(raw);
            return ["http:", "https:"].includes(url.protocol) ? url.href : "";
        } catch (error) {
            return "";
        }
    }

    function responseErrorMessage(payload, status) {
        const message = payload?.error?.json?.message
            || payload?.error?.message
            || payload?.message;
        if (message) return String(message);
        return status ? `WarEra API returned ${status}.` : "WarEra API returned an invalid response.";
    }

    async function request(procedure, input, options = {}) {
        const fetchImpl = options.fetchImpl || global.fetch;
        if (typeof fetchImpl !== "function") {
            throw new Error("Profile import is not supported in this browser.");
        }

        const headers = { "Content-Type": "application/json" };
        const apiKey = String(options.apiKey || "").trim();
        if (apiKey) headers["X-API-Key"] = apiKey;

        const response = await fetchImpl(`${API_BASE_URL}/${procedure}`, {
            method: "POST",
            headers,
            body: JSON.stringify(input || {}),
            signal: options.signal,
        });

        let payload;
        try {
            payload = await response.json();
        } catch (error) {
            if (error?.name === "AbortError") throw error;
            throw new Error(responseErrorMessage(null, response.ok ? 0 : response.status));
        }
        const result = payload?.result;
        if (!response.ok || payload?.error || !result || typeof result !== "object" || !("data" in result)) {
            throw new Error(responseErrorMessage(payload, response.status));
        }
        return result.data;
    }

    function normalizeSearchUser(raw) {
        if (!raw || typeof raw !== "object") return null;
        const id = String(raw._id || raw.id || "").trim();
        const username = String(raw.username || "").trim();
        if (!id || !username) return null;
        return {
            id,
            username,
            avatarUrl: safeAvatarUrl(raw.avatarUrl),
            level: boundedInteger(raw.leveling?.level, 1, 50, 1),
        };
    }

    async function searchUsers(query, options = {}) {
        const normalizedQuery = String(query || "").trim();
        if (normalizedQuery.length < 2) return [];

        const result = await request("search.searchAnything", {
            searchText: normalizedQuery,
        }, options);
        const userIds = Array.isArray(result?.userIds)
            ? result.userIds.map(String).filter(Boolean).slice(0, MAX_SEARCH_RESULTS)
            : [];
        const settled = await Promise.allSettled(userIds.map((userId) => (
            request("user.getUserLite", { userId }, options)
        )));
        const matches = settled
            .filter((entry) => entry.status === "fulfilled")
            .map((entry) => normalizeSearchUser(entry.value))
            .filter(Boolean);
        if (userIds.length && !matches.length) {
            const firstFailure = settled.find((entry) => entry.status === "rejected");
            if (firstFailure) throw firstFailure.reason;
            throw new Error("WarEra returned invalid player search results.");
        }
        return matches;
    }

    function equipmentCode(rawEquipment) {
        if (typeof rawEquipment === "string") return rawEquipment;
        if (rawEquipment && typeof rawEquipment === "object") return rawEquipment.code;
        return "";
    }

    function normalizeCode(value) {
        return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function equipmentTierIndex(slotIndex, rawEquipment, slotPresent = rawEquipment !== undefined) {
        if (!slotPresent) return 0;
        const code = String(equipmentCode(rawEquipment) || "").trim().toLowerCase();
        if (!code) return null;
        if (slotIndex === 0) {
            const baseCode = code.replace(/_\d+$/, "");
            return WEAPON_TIER_BY_CODE[normalizeCode(baseCode)] ?? null;
        }
        const slot = GEAR_SLOTS[slotIndex];
        if (!slot) return null;
        const match = normalizeCode(code).match(new RegExp(`^${slot}([1-6])$`));
        if (!match) return null;
        return Number.parseInt(match[1], 10);
    }

    function ammoTierIndex(_user, equipment) {
        const ammoPresent = equipment !== null
            && typeof equipment === "object"
            && !Array.isArray(equipment)
            && Object.prototype.hasOwnProperty.call(equipment, "ammo");
        if (!ammoPresent) return 0;
        const code = normalizeCode(equipmentCode(equipment?.ammo));
        if (code) return AMMO_TIER_BY_CODE[code] ?? null;
        return null;
    }

    function normalizeProfile(user, equipment, loadoutAvailable = true) {
        if (!user || typeof user !== "object") {
            throw new Error("WarEra returned an invalid player profile.");
        }
        const id = String(user._id || user.id || "").trim();
        const username = String(user.username || "").trim();
        if (!id || !username) {
            throw new Error("WarEra returned an incomplete player profile.");
        }

        const rawLevel = finiteNumber(user.leveling?.level);
        const rawRankBonus = finiteNumber(user.skills?.attack?.militaryRankPercent);
        if (!isIntegerInRange(rawLevel, 1, 50)
            || rawRankBonus === null
            || rawRankBonus < 0
            || rawRankBonus > 37.5
            || !Number.isInteger(rawRankBonus * 4)) {
            throw new Error("WarEra returned a profile without a valid level or rank bonus.");
        }

        const skills = user.skills && typeof user.skills === "object" ? user.skills : {};
        const equipmentIsRecord = equipment !== null
            && typeof equipment === "object"
            && !Array.isArray(equipment);
        const normalizedLoadoutAvailable = Boolean(loadoutAvailable && equipmentIsRecord);
        const equipped = equipmentIsRecord ? equipment : {};
        const rawSkillLevels = SKILL_KEYS.map((key) => finiteNumber(skills[key]?.level));
        const skillsAvailable = rawSkillLevels.every((value) => isIntegerInRange(value, 0, 10));
        const gearTiers = GEAR_SLOTS.map((slot, index) => equipmentTierIndex(
            index,
            equipped[slot],
            Object.prototype.hasOwnProperty.call(equipped, slot),
        ));
        const ammoIndex = ammoTierIndex(user, equipped);
        const loadoutWarnings = [];
        if (normalizedLoadoutAvailable) {
            GEAR_SLOTS.forEach((slot, index) => {
                if (Object.prototype.hasOwnProperty.call(equipped, slot)
                    && gearTiers[index] === null) {
                    loadoutWarnings.push(`Unknown ${slot} code`);
                }
            });
            if (Object.prototype.hasOwnProperty.call(equipped, "ammo") && ammoIndex === null) {
                loadoutWarnings.push("Unknown ammo code");
            }
        }
        return {
            id,
            username,
            avatarUrl: safeAvatarUrl(user.avatarUrl),
            level: rawLevel,
            rankBonusPct: rawRankBonus,
            skillLevels: rawSkillLevels.map((value) => (
                isIntegerInRange(value, 0, 10) ? value : null
            )),
            skillsAvailable,
            skillsError: skillsAvailable
                ? ""
                : "One or more combat skill levels are missing, so skill pins cannot be imported.",
            gearTiers,
            ammoIndex,
            loadoutAvailable: normalizedLoadoutAvailable,
            loadoutWarnings,
        };
    }

    async function loadProfile(userId, options = {}) {
        const normalizedId = String(userId || "").trim();
        if (!normalizedId) throw new Error("Choose a player to import.");

        const [userResult, equipmentResult] = await Promise.allSettled([
            request("user.getUserLite", { userId: normalizedId }, options),
            request("inventory.fetchCurrentEquipment", { userId: normalizedId }, options),
        ]);
        if (userResult.status === "rejected") throw userResult.reason;
        if (equipmentResult.status === "rejected" && equipmentResult.reason?.name === "AbortError") {
            throw equipmentResult.reason;
        }

        const loadoutAvailable = equipmentResult.status === "fulfilled"
            && equipmentResult.value !== null
            && typeof equipmentResult.value === "object"
            && !Array.isArray(equipmentResult.value);
        return {
            ...normalizeProfile(
                userResult.value,
                loadoutAvailable ? equipmentResult.value : {},
                loadoutAvailable,
            ),
            loadoutError: loadoutAvailable
                ? ""
                : "The equipped loadout could not be loaded. You can still import level, rank, and skills.",
        };
    }

    function cloneArray(value, length) {
        return Array.from({ length }, (_, index) => (
            Array.isArray(value) && index < value.length ? value[index] : null
        ));
    }

    function buildImportedConstraints(current, profile, options = {}) {
        const source = current && typeof current === "object" ? current : {};
        const result = {
            skills: cloneArray(source.skills, 9),
            gear: cloneArray(source.gear, 6),
            ammo: source.ammo ?? null,
            food: source.food ?? null,
        };
        const importedSkills = cloneArray(profile?.skillLevels, 9);
        if (options.pinSkills && importedSkills.every((value) => isIntegerInRange(value, 0, 10))) {
            result.skills = importedSkills;
        }
        if (options.pinLoadout) {
            const importedGear = cloneArray(profile?.gearTiers, 6);
            result.gear = importedGear.map((tier, index) => (
                tier === null || tier === undefined ? result.gear[index] : tier
            ));
            if (profile?.ammoIndex !== null && profile?.ammoIndex !== undefined) {
                result.ammo = profile.ammoIndex;
            }
        }
        return result;
    }

    return {
        API_BASE_URL,
        GEAR_SLOTS,
        MAX_SEARCH_RESULTS,
        SKILL_KEYS,
        ammoTierIndex,
        buildImportedConstraints,
        equipmentTierIndex,
        loadProfile,
        normalizeProfile,
        normalizeSearchUser,
        request,
        safeAvatarUrl,
        searchUsers,
    };
}));
