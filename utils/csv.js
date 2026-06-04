function escapeCsvValue(value) {
    const stringValue = value == null ? "" : String(value);
    const safeValue = /^[=+\-@]/.test(stringValue)
        ? `'${stringValue}`
        : stringValue;

    if (/[",\n\r]/.test(safeValue)) {
        return `"${safeValue.replace(/"/g, '""')}"`;
    }

    return safeValue;
}

module.exports = {
    escapeCsvValue
};
