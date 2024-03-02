import { connectToDbWrapped } from "./utils/dbConnectionHolder.js";
import { configureLogging } from "./utils/utils.js";
import { configureAndStartServer } from "./utils/server.js";
import { scheduleRatesRetrieval } from "./utils/scheduleRatesRetrieval.js";
import performDBInitialization from "./utils/initDB.js";
import { scheduleRatesRetrievalForPublicSwap } from "./services/swapListGenerator.js";

configureLogging();
connectToDbWrapped(performDBInitialization);
scheduleRatesRetrieval();
configureAndStartServer();
scheduleRatesRetrievalForPublicSwap();
