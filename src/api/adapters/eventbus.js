import EventBusInstance from "eventbusjs";

export const EventBus = EventBusInstance;

export const NO_AUTHENTICATION_EVENT = "noAuthenticationEvent";
export const SUCCESSFUL_PAYMENT_EVENT = "successfulPaymentEvent";
export const DENOMINATION_CHANGED_EVENT = "denominationChangedEvent";
export const CURRENT_NETWORK_CHANGED_EVENT = "currentNetworkChangedEvent";
export const FIAT_CURRENCY_CHANGED_EVENT = "fiatCurrencyChangedEvent";
export const LOGGED_OUT_EVENT = "loggedOutEvent";
export const SIGNED_UP_EVENT = "signedUpEvent";
export const SIGNED_IN_EVENT = "signedInEvent";
export const TX_DATA_RETRIEVED_EVENT = "txDataRetrievedEvent";
export const NEW_BLOCK_EVENT = "newBlockEvent";
export const NEW_BLOCK_DEDUPLICATED_EVENT = "newBlockTheOnlyEvent";
export const THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT = "thereIsSessionOnAPIInitializationEvent";
export const TRANSACTION_PUSHED_EVENT = "transactionPushedEvent";
export const WALLET_IMPORTED_EVENT = "walletImportedEvent";
export const NEW_NOT_LOCAL_TRANSACTIONS_EVENT = "newNotLocalTransactionsEvent";
export const AUTHENTICATION_DISCOVERED_EVENT = "authenticationDiscoveredEvent";