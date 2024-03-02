export class JoiValidationWrapper {
    /**
     * This wrapper is just a workaround due to inability to mock Joi.validate itself for some reason
     */
    static joiValidate(data, scheme) {
        return scheme.validate(data);
    }
}
