import { connectToDbWrapped } from "./utils/dbConnectionHolder";
import { configureLogging } from "./utils/utils";
import { configureAndStartServer } from "./utils/server";
import { scheduleRatesRetrieval } from "./utils/scheduleRatesRetrieval";
import performDBInitialization from "./utils/initDB";

configureLogging();
connectToDbWrapped(performDBInitialization);
scheduleRatesRetrieval();
configureAndStartServer();
