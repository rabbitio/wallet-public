export default class DedicatedNotificationsService {
    /**
     * Returns unseen notifications according to given last view timestamp
     *
     * @param lastViewTimestamp {number} - timestamp when notifications were last seen
     * @return {Promise<Array<Notification>>}
     */
    getUnseenNotificationsList(lastViewTimestamp) {}

    /**
     * Returns all notifications
     * @param walletCreationTime {number} - wallet creation timestamp
     *
     * @return {Promise<Array<Notification>>}
     */
    getWholeNotificationsList(walletCreationTime) {}
}
