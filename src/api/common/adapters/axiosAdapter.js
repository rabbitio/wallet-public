import axios from "axios";

class AxiosAdapter {
    static async call(method, ...args) {
        return await axios[method](...args);
    }

    static async get(...args) {
        return await axios.get(...args);
    }

    static async post(...args) {
        return await axios.post(...args);
    }

    static async put(...args) {
        return await axios.put(...args);
    }

    static async delete(...args) {
        return await axios.delete(...args);
    }

    static async patch(...args) {
        return await axios.patch(...args);
    }

    static async options(...args) {
        return await axios.options(...args);
    }

    static async head(...args) {
        return await axios.head(...args);
    }
}

export default AxiosAdapter;
