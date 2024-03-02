import log4js from "log4js";

import { ControllerUtils } from "./controllerUtils.js";
import schemas from "../models/joi_schemas.js";
import AddressesDataService from "../services/addressesDataService.js";
import {
    GET_ADDRESSES_DATA_EP_NUMBER,
    GET_ADDRESSES_INDEXES_EP_NUMBER,
    UPDATE_ADDRESS_INDEX_AND_SAVE_ADDRESSES_DATA_EP_NUMBER,
    UPDATE_ADDRESS_INDEX_EP_NUMBER,
    REMOVE_ADDRESS_DATA_EP_NUMBER,
    UPDATE_ADDRESS_DATA_EP_NUMBER,
} from "./endpointNumbers.js";

const log = log4js.getLogger("addressesDataController");

export default class AddressesDataController {
    /**
     * Returns addresses data
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     * 3. Path params:
     *    - "walletId" - not empty string
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if addresses data is successfully retrieved
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 200 status
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for 200 status:
     *        { addressesData: [ { uuid: string, encryptedAddressData: string }, ... ] }
     */
    static async getAddressesData(req, res) {
        log.debug("Start getting addresses data.");
        const endpointNumber = GET_ADDRESSES_DATA_EP_NUMBER;
        try {
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, {}));
            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.getAddressesData,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid. Start getting addresses data.");

                const addressesData = await AddressesDataService.getAddressesData(data.walletId);

                log.debug("Address data was retrieved, sending 200 and data array.");
                ControllerUtils.processSuccess(res, 200, addressesData);
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Failed to get addresses data due to internal error. ", e);
        }
    }

    /**
     * Returns indexes of current address nodes.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     * 3. Path params:
     *    - "walletId" - not empty string
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if indexes successfully retrieved
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 200 status
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for 200 status:
     *        { "addressIndexes": { "path#1": integer, "path#2": integer, ... } }
     */
    static async getAddressesIndexes(req, res) {
        log.debug("Start getting addresses indexes.");
        const endpointNumber = GET_ADDRESSES_INDEXES_EP_NUMBER;
        try {
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, {}));
            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.getAddressIndexes,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid. Start getting address indexes.");

                const addressIndexes = await AddressesDataService.getAddressesIndexes(data.walletId);

                log.debug("Address indexes were retrieved, sending 200 and indexes object.");
                ControllerUtils.processSuccess(res, 200, addressIndexes);
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Failed to get address indexes due to internal error. ", e);
        }
    }

    /**
     * Updates index of address node by provided path
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     * 3. Path params:
     *    - "walletId" - not empty string
     * 4. Body JSON scheme:
     *    {
     *        "newIndexValue": integer, // >= 0
     *        "path": string, // not empty
     *    }

     * It sends:
     *    HTTP Code:
     *      - 204 if there is successful update occurred
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 204 statuses:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - empty for 204
     */
    static async updateAddressIndex(req, res) {
        log.debug("Update address index request received.");
        const endpointNumber = UPDATE_ADDRESS_INDEX_EP_NUMBER;
        try {
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, req.body));
            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.updateAddressIndexSchema,
                endpointNumber
            );

            if (isRequestValid) {
                const { path, newIndexValue } = data;
                log.debug("Request is valid, updating index.");

                await AddressesDataService.updateAddressIndex(data.walletId, path, newIndexValue);

                log.debug("Address index was updated, sending 204.");
                ControllerUtils.processSuccess(res, 204);
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Failed to update address index due to internal error. ", e);
        }
    }

    /**
     * Updates index of address node by given path and saves given addresses data
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     * 3. Path params:
     *    - "walletId" - not empty string
     * 4. Body JSON scheme
     *    - {
     *         "path": not empty string,
     *         "addressesData": [ // min length is 1
     *              {
     *                  "uuid": not empty string,
     *                  "encryptedAddressData": not empty string
     *              },
     *              ...
     *          ],
     *          baseIndex: number, // integer >= -1
     *      }
     *
     * It sends:
     *    HTTP Code:
     *      - 204 if the operation succeeds
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 204 statuses:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - empty for 204 status
     */
    static async updateAddressIndexAndSaveAddressesData(req, res) {
        log.debug("Update address index and save addresses data request received.");
        const endpointNumber = UPDATE_ADDRESS_INDEX_AND_SAVE_ADDRESSES_DATA_EP_NUMBER;
        try {
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, req.body));
            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.updateAddressIndexAndSaveDataSchema,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid, proceed with updating the index and saving the addresses data.");

                const { path, addressesData, baseIndex } = data;
                await AddressesDataService.saveAddressesDataAndUpdateAddressIndexByPath(
                    data.walletId,
                    path,
                    addressesData,
                    baseIndex
                );

                log.debug("Addresses index was updated, addresses data were saved, sending 204.");
                ControllerUtils.processSuccess(res, 204);
            }
        } catch (e) {
            ControllerUtils.processInternalError(
                res,
                endpointNumber,
                "Failed to update address index and save addresses data due to internal error. ",
                e
            );
        }
    }

    /**
     * Removes address data by given address uuid.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     * 3. Path params:
     *    - "walletId" - not empty string
     *    - "uuid" - not empty string
     *
     * It sends:
     *    HTTP Code:
     *      - 204 if target address data is removed successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 204 statuses:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - empty for 204 status
     */
    static async removeAddressData(req, res) {
        log.debug("Remove address data request received.");
        const endpointNumber = REMOVE_ADDRESS_DATA_EP_NUMBER;
        try {
            const { uuid } = req.params;
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, { uuid }));

            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.removeAddressDataScheme,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid, proceed with removing address data.");

                await AddressesDataService.removeAddressData(data.walletId, data.uuid);

                log.debug("Address data has been successfully removed, sending 204.");
                ControllerUtils.processSuccess(res, 204);
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Failed to remove address data due to internal error. ", e);
        }
    }

    /**
     * Updates address data by given address uuid
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     * 3. Path params:
     *    - "walletId" - not empty string
     *    - "uuid" - not empty string
     *
     * 4. Body JSON scheme:
     *    - { addressData: not empty string }
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if target address data is updated successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 200 statuses:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - empty for 200 status
     */
    static async updateAddressData(req, res) {
        log.debug("Update address data request received.");
        const endpointNumber = UPDATE_ADDRESS_DATA_EP_NUMBER;
        try {
            const { uuid } = req.params;
            const { addressData } = req.body;
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, { uuid, addressData }));

            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.updateAddressDataScheme,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid, proceed with updating address data.");

                await AddressesDataService.updateAddressData(data.walletId, data.uuid, data.addressData);

                log.debug("Address data has been successfully updated, sending 200.");
                ControllerUtils.processSuccess(res, 200);
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Failed to update address data due to internal error. ", e);
        }
    }
}
