(function (global) {
    "use strict";

    const STORAGE_KEY = "warera-toolkit-api-key-v1";
    const LEGACY_STORAGE_KEYS = Object.freeze([
        "warera-eco-simulator-warera-api-token-v1",
        "wbt_warera_api_key",
    ]);
    const STORAGE_KEYS = Object.freeze([STORAGE_KEY, ...LEGACY_STORAGE_KEYS]);

    function normalize(value) {
        return String(value || "").trim();
    }

    function unavailable(value = "", error = null) {
        return {
            status: "unavailable",
            value: normalize(value),
            persisted: false,
            error,
        };
    }

    function save(storage, value) {
        const normalized = normalize(value);
        if (!normalized) return clear(storage);
        if (!storage || typeof storage.setItem !== "function") return unavailable(normalized);

        try {
            storage.setItem(STORAGE_KEY, normalized);
        } catch (error) {
            return unavailable(normalized, error);
        }

        let compatibilityMirrored = true;
        let firstCompatibilityError = null;
        for (const legacyKey of LEGACY_STORAGE_KEYS) {
            try {
                storage.setItem(legacyKey, normalized);
            } catch (error) {
                compatibilityMirrored = false;
                firstCompatibilityError ||= error;
            }
        }

        return {
            status: "saved",
            value: normalized,
            persisted: true,
            compatibilityMirrored,
            error: firstCompatibilityError,
        };
    }

    function clear(storage) {
        if (!storage || typeof storage.removeItem !== "function") return unavailable();

        let canonicalRemoved = true;
        let compatibilityCleared = true;
        let firstError = null;
        for (const key of STORAGE_KEYS) {
            try {
                storage.removeItem(key);
            } catch (error) {
                firstError ||= error;
                if (key === STORAGE_KEY) canonicalRemoved = false;
                else compatibilityCleared = false;
            }
        }

        if (!canonicalRemoved || !compatibilityCleared) {
            return {
                ...unavailable("", firstError),
                compatibilityCleared,
            };
        }
        return {
            status: "missing",
            value: "",
            persisted: true,
            compatibilityCleared,
            error: null,
        };
    }

    function load(storage) {
        if (!storage || typeof storage.getItem !== "function") return unavailable();

        let canonicalValue;
        try {
            canonicalValue = normalize(storage.getItem(STORAGE_KEY));
        } catch (error) {
            return unavailable("", error);
        }

        if (canonicalValue) {
            const saved = save(storage, canonicalValue);
            return {
                ...saved,
                status: saved.persisted ? "saved" : "unavailable",
                value: canonicalValue,
                source: "canonical",
                migrated: false,
            };
        }

        const legacyValues = [];
        try {
            for (const key of LEGACY_STORAGE_KEYS) {
                const value = normalize(storage.getItem(key));
                if (value && !legacyValues.includes(value)) legacyValues.push(value);
            }
        } catch (error) {
            return unavailable("", error);
        }

        if (legacyValues.length > 1) {
            return {
                status: "conflict",
                value: "",
                persisted: false,
                migrated: false,
            };
        }

        if (legacyValues.length === 1) {
            const migrated = save(storage, legacyValues[0]);
            return {
                ...migrated,
                status: migrated.persisted ? "saved" : "unavailable",
                value: legacyValues[0],
                source: "legacy",
                migrated: migrated.persisted,
            };
        }

        return {
            status: "missing",
            value: "",
            persisted: true,
            source: "none",
            migrated: false,
        };
    }

    function handlesStorageKey(key) {
        return key === null || STORAGE_KEYS.includes(key);
    }

    function handlesStorageEvent(event) {
        return Boolean(event) && handlesStorageKey(event.key);
    }

    const api = Object.freeze({
        STORAGE_KEY,
        LEGACY_STORAGE_KEYS,
        STORAGE_KEYS,
        normalize,
        load,
        save,
        clear,
        handlesStorageKey,
        handlesStorageEvent,
    });

    global.WareraApiKey = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
