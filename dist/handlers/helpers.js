"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonBodyWithProps = void 0;
const jsonBodyWithProps = (props, required = []) => {
    return {
        schema: {
            body: {
                type: "object",
                properties: props,
                required,
            },
        },
    };
};
exports.jsonBodyWithProps = jsonBodyWithProps;
//# sourceMappingURL=helpers.js.map