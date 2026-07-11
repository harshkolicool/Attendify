/**
 * Shared password hashing utilities used by Student and Teacher schemas.
 * Extracted to avoid code duplication across models.
 */

const bcrypt = require("bcrypt");

/**
 * Returns true if the value is already a bcrypt hash.
 * Prevents double-hashing.
 */
function isBcryptHash(value) {
    return typeof value === "string" && /^\$2[aby]\$\d{2}\$/.test(value);
}

/**
 * Hashes a plaintext password with bcrypt.
 * Returns the input unchanged if it is already a hash or falsy.
 *
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPasswordIfNeeded(password) {
    if (!password || isBcryptHash(password)) {
        return password;
    }

    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
}

/**
 * Mongoose pre-update hook that hashes the password field when it
 * appears in a findOneAndUpdate / updateOne / updateMany operation.
 *
 * Bind as: schema.pre("updateOne", hashPasswordInUpdate)
 */
async function hashPasswordInUpdate() {
    const update = this.getUpdate();

    if (!update || Array.isArray(update)) {
        return;
    }

    if (
        update.$set &&
        Object.prototype.hasOwnProperty.call(update.$set, "password")
    ) {
        update.$set.password = await hashPasswordIfNeeded(update.$set.password);
    }

    if (Object.prototype.hasOwnProperty.call(update, "password")) {
        update.password = await hashPasswordIfNeeded(update.password);
    }

    this.setUpdate(update);
}

/**
 * Compares a plaintext password against a stored hash (or plaintext fallback).
 *
 * @param {string} enteredPassword
 * @param {string} storedPassword
 * @returns {Promise<boolean>}
 */
async function comparePassword(enteredPassword, storedPassword) {
    if (!storedPassword) {
        return false;
    }

    if (isBcryptHash(storedPassword)) {
        return await bcrypt.compare(enteredPassword, storedPassword);
    }

    // Plaintext fallback (legacy / migration path)
    return enteredPassword === storedPassword;
}

module.exports = {
    isBcryptHash,
    hashPasswordIfNeeded,
    hashPasswordInUpdate,
    comparePassword
};
