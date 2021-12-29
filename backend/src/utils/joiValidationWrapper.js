import Joi from "joi";

/**
 * This wrapper is just a workaround due to inability to mock Joi.validate itself for some reason
 */
export function joiValidate(data, scheme) {
    return Joi.validate(data, scheme);
}
