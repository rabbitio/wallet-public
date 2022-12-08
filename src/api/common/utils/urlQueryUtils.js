const PARAMETER_VALUES_SEPARATOR = "|*|"; // Sting that with high probability will not be in the user's data

/**
 * Adds specified parameter with values to the URL query string
 *
 * @param parameterName - String - name of the parameter
 * @param values - Array of String values
 * @param updateURLCallback - callback that will be called with the updated query string. Can be used to save it to URL
 */
export function saveQueryParameterAndValues(parameterName, values, updateURLCallback = newQueryString => {}) {
    let parametersAndValues = parseSearchString();
    parametersAndValues = parametersAndValues.filter(parameterAndValues => parameterAndValues[0] !== parameterName);
    const parameterValuesForURL = encodeURIComponent(values.join(PARAMETER_VALUES_SEPARATOR));
    parametersAndValues.push([parameterName, parameterValuesForURL]);
    const newQueryString = `?${parametersAndValues.map(parameterAndValues => parameterAndValues.join("=")).join("&")}`;
    updateURLCallback(newQueryString);

    return newQueryString;
}

/**
 * Removes specified parameter with values from the URL query string
 *
 * @param parameterName - String - name of the parameter
 * @param updateURLCallback - callback that will be called with the updated query string. Can be used to save it to URL
 */
// TODO: [tests, moderate] units required the same as or other functions in this module
export function removeQueryParameterAndValues(parameterName, updateURLCallback = newQueryString => {}) {
    let parametersAndValues = parseSearchString();
    parametersAndValues = parametersAndValues.filter(parameterAndValues => parameterAndValues[0] !== parameterName);
    const newQueryString = `?${parametersAndValues.map(parameterAndValues => parameterAndValues.join("=")).join("&")}`;
    updateURLCallback(newQueryString);

    return newQueryString;
}

/**
 * Retrieves parameter values from the URL query string.
 *
 * If there are several parameters with the same name in the URL then all their values are returned
 *
 * @param name - String - parameter name
 * @return Array of values. [] - ]if the parameter is not present in URL. [""] - if parameter present but has empty value
 */
export function getQueryParameterValues(name) {
    return parseSearchString()
        .filter(parameterAndValue => parameterAndValue[0] === name)
        .reduce((allValues, parameterAndValue) => {
            const values = decodeURIComponent(parameterAndValue[1] || "").split(PARAMETER_VALUES_SEPARATOR);
            return [...allValues, ...values];
        }, []);
}

function parseSearchString() {
    const trimmed = (window.location.search?.slice(1) || "").trim();

    return (trimmed && trimmed.split("&").map(parameterAndValue => parameterAndValue.split("="))) || [];
}
