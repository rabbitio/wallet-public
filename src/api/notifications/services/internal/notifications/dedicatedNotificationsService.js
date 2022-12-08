export default class DedicatedNotificationsService {
    /**
     * Returns unseen notifications according to the given last view timestamp
     *
     * @param lastViewTimestamp {number} - timestamp when notifications were last seen
     * @param [forceFetchData] {boolean} the flag to load data forcely if using caches
     * @return {Promise<Array<Notification>>}
     */
    getUnseenNotificationsList(lastViewTimestamp, forceFetchData) {}

    /**
     * Returns all notifications
     * @param walletCreationTime {number} - wallet creation timestamp
     *
     * @return {Promise<Array<Notification>>}
     */
    getWholeNotificationsList(walletCreationTime) {}
}
