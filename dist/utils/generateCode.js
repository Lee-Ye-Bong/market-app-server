"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNumericCode = generateNumericCode;
function generateNumericCode(len = 6) {
    let s = "";
    for (let i = 0; i < len; i++)
        s += Math.floor(Math.random() * 10);
    return s;
}
