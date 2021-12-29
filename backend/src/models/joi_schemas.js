import Joi from "joi";

export default {
    createSchema: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        passphraseHash: Joi.string()
            .min(1)
            .required(),
        passwordHash: Joi.string()
            .min(1)
            .required(),
        initialIndexesData: Joi.array()
            .items(
                Joi.object().keys({
                    p: Joi.string()
                        .min(1)
                        .required(),
                    i: Joi.number()
                        .min(0)
                        .required(),
                })
            )
            .required(),
        initialAddressesData: Joi.array()
            .items(
                Joi.object().keys({
                    h: Joi.string()
                        .min(1)
                        .required(),
                    encData: Joi.string()
                        .min(1)
                        .required(),
                })
            )
            .required(),
    }),
    authenticateSchema: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        passphraseHash: Joi.string()
            .min(1)
            .required(),
        passwordHash: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
    }),
    checkPassphraseSchema: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        passphraseHash: Joi.string()
            .min(1)
            .required(),
    }),
    getAddressIndexes: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
    }),
    getAddressesData: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
    }),
    removeAddressDataScheme: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        uuid: Joi.string()
            .min(1)
            .required(),
    }),
    updateAddressDataScheme: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        uuid: Joi.string()
            .min(1)
            .required(),
        addressData: Joi.string()
            .min(1)
            .required(),
    }),
    updateAddressIndexSchema: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        path: Joi.string()
            .min(1)
            .required(),
        newIndexValue: Joi.number()
            .integer()
            .min(0)
            .required(),
    }),
    updateAddressIndexAndSaveDataSchema: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        path: Joi.string()
            .min(1)
            .required(),
        addressesData: Joi.array()
            .items(
                Joi.object().keys({
                    uuid: Joi.string()
                        .min(1)
                        .required(),
                    encryptedAddressData: Joi.string()
                        .min(1)
                        .required(),
                })
            )
            .min(1)
            .required(),
        baseIndex: Joi.number()
            .integer()
            .min(-1)
            .required(),
    }),
    getWalletDataSchema: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
    }),
    logoutSchema: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
    }),
    deleteWalletSchema: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        passwordHash: Joi.string()
            .min(1)
            .required(),
    }),
    checkPasswordSchema: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        passwordHash: Joi.string()
            .min(1)
            .required(),
    }),
    changePasswordSchema: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        passwordHash: Joi.string()
            .min(1)
            .required(),
        newPasswordHash: Joi.string()
            .min(1)
            .required(),
    }),
    saveSettingsSchema: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        settings: Joi.object().keys({
            currencyCode: Joi.string().min(1),
            addressesType: Joi.string().min(1),
            lastNotificationsViewTimestamp: Joi.string().min(1),
            showFeeRates: Joi.string().min(1),
        }),
    }),
    saveTransactionDataScheme: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        transactionIdHash: Joi.string()
            .min(1)
            .required(),
        encryptedNote: Joi.string()
            .min(1)
            .required(),
    }),
    updateTransactionDataScheme: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        transactionIdHash: Joi.string()
            .min(1)
            .required(),
        encryptedNote: Joi.string()
            .min(1)
            .required(),
    }),
    getTransactionsDataScheme: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        transactionIdHashes: Joi.string()
            .min(1)
            .required(),
    }),
    saveEncryptedIpScheme: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        encryptedIp: Joi.string()
            .min(1)
            .required(),
        ipHash: Joi.string()
            .min(1)
            .required(),
    }),
    getEncryptedIpsScheme: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
    }),
    deleteEncryptedIpsScheme: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        ipHashes: Joi.array()
            .items(Joi.string())
            .required(),
    }),
    isIpHashPresentScheme: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        ipHash: Joi.array()
            .items(Joi.string())
            .required(),
    }),
    saveEncryptedInvoiceScheme: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        invoiceUuid: Joi.string()
            .min(1)
            .required(),
        encryptedInvoiceData: Joi.string()
            .min(1)
            .required(),
    }),
    getEncryptedInvoicesScheme: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        invoicesUuids: Joi.array().items(Joi.string()),
    }),
    deleteEncryptedInvoiceScheme: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        invoicesUuids: Joi.array()
            .items(Joi.string())
            .required(),
    }),
    saveEncryptedSavedAddress: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        savedAddressUuid: Joi.string()
            .min(1)
            .required(),
        encryptedSavedAddressData: Joi.string()
            .min(1)
            .required(),
    }),
    getEncryptedSavedAddresses: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
    }),
    deleteEncryptedSavedAddresses: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        savedAddressesUuids: Joi.array()
            .items(Joi.string())
            .required(),
    }),
    getFiatRates: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
    }),
    getFiatRateForSpecificDate: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        timestamp: Joi.number()
            .min(0)
            .required(),
    }),
    getNotifications: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
    }),
    saveNotification: Joi.object().keys({
        token: Joi.string()
            .min(1)
            .required(),
        text: Joi.string()
            .min(1)
            .required(),
        title: Joi.string()
            .min(1)
            .required(),
    }),
    sendEmail: Joi.object().keys({
        subject: Joi.string()
            .min(1)
            .required(),
        body: Joi.string()
            .min(1)
            .required(),
    }),
    saveTransactions: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        transactions: Joi.array().required(),
    }),
    getTransactions: Joi.object().keys({
        walletId: Joi.string()
            .min(1)
            .required(),
        sessionId: Joi.string()
            .min(1)
            .required(),
        clientIpHash: Joi.string()
            .min(1)
            .required(),
        addresses: Joi.array().required(),
    }),
};
