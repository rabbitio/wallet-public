export default class FiatCurrenciesService {
    static getFullCurrencyNameByCode(code = "") {
        const data = fiatCurrenciesList.find(currencyData => currencyData[0] === code.toUpperCase());
        return (data && data[2]) || null;
    }

    static isCodeValid(code) {
        return !!fiatCurrenciesList.find(currenciesData => currenciesData[0] === code);
    }

    /**
     * Returns currency symbol by code if present
     *
     * @param code {string} currency code
     * @return {string|null} code or null if there is no symbol for the currency
     */
    static getCurrencySymbolByCode(code = "") {
        const data = fiatCurrenciesList.find(currencyData => currencyData[0] === code.toUpperCase());
        return (data && data[1]) || null;
    }

    static getCurrencyDecimalCountByCode(code = "") {
        const data = fiatCurrenciesList.find(currencyData => currencyData[0] === code.toUpperCase());
        return (data && data[3]) || null;
    }
}

const fiatCurrenciesList = [
    ["USD", "$", "US Dollar", 2],
    ["CAD", "CA$", "Canadian Dollar", 2],
    ["EUR", "€", "Euro", 2],
    ["AED", "AED", "UAE Dirham", 2],
    ["AFN", "؋", "Afghan Afghani", 0],
    ["ALL", "ALL", "Albanian Lek", 0],
    ["AMD", "֏", "Armenian Dram", 0],
    ["ARS", "AR$", "Argentine Peso", 2],
    ["AUD", "AU$", "Australian Dollar", 2],
    ["AZN", "₼", "Azerbaijani Manat", 2],
    ["BAM", "KM", "Bosnia-Herzegovina Convertible Mark", 2],
    ["BDT", "Tk", "Bangladeshi Taka", 2],
    ["BGN", "BGN", "Bulgarian Lev", 2],
    ["BHD", "BD", "Bahraini Dinar", 3],
    ["BIF", "FBu", "Burundian Franc", 0],
    ["BND", "BN$", "Brunei Dollar", 2],
    ["BOB", "Bs", "Bolivian Boliviano", 2],
    ["BRL", "R$", "Brazilian Real", 2],
    ["BWP", "BWP", "Botswanan Pula", 2],
    ["BYN", "Br", "Belarusian Ruble", 2],
    ["BZD", "BZ$", "Belize Dollar", 2],
    ["CDF", "CDF", "Congolese Franc", 2],
    ["CHF", "CHF", "Swiss Franc", 2],
    ["CLP", "CL$", "Chilean Peso", 0],
    ["CNY", "CN¥", "Chinese Yuan", 2],
    ["COP", "CO$", "Colombian Peso", 0],
    ["CRC", "₡", "Costa Rican Colón", 0],
    ["CVE", "CV$", "Cape Verdean Escudo", 2],
    ["CZK", "Kč", "Czech Republic Koruna", 2],
    ["DJF", "Fdj", "Djiboutian Franc", 0],
    ["DKK", "Dkr", "Danish Krone", 2],
    ["DOP", "RD$", "Dominican Peso", 2],
    ["DZD", "DA", "Algerian Dinar", 2],
    ["EEK", "Ekr", "Estonian Kroon", 2],
    ["EGP", "EGP", "Egyptian Pound", 2],
    ["ERN", "Nfk", "Eritrean Nakfa", 2],
    ["ETB", "Br", "Ethiopian Birr", 2],
    ["GBP", "£", "British Pound Sterling", 2],
    ["GEL", "₾", "Georgian Lari", 2],
    ["GHS", "₵", "Ghanaian Cedi", 2],
    ["GNF", "FG", "Guinean Franc", 0],
    ["GTQ", "GTQ", "Guatemalan Quetzal", 2],
    ["HKD", "HK$", "Hong Kong Dollar", 2],
    ["HNL", "HNL", "Honduran Lempira", 2],
    ["HRK", "kn", "Croatian Kuna", 2],
    ["HUF", "Ft", "Hungarian Forint", 0],
    ["IDR", "Rp", "Indonesian Rupiah", 0],
    ["ILS", "₪", "Israeli New Sheqel", 2],
    ["INR", "₹", "Indian Rupee", 2],
    ["IQD", "IQD", "Iraqi Dinar", 0],
    ["IRR", "﷼", "Iranian Rial", 0],
    ["ISK", "Ikr", "Icelandic Króna", 0],
    ["JMD", "J$", "Jamaican Dollar", 2],
    ["JOD", "JD", "Jordanian Dinar", 3],
    ["JPY", "¥", "Japanese Yen", 0],
    ["KES", "Ksh", "Kenyan Shilling", 2],
    ["KHR", "KHR", "Cambodian Riel", 2],
    ["KMF", "CF", "Comorian Franc", 0],
    ["KRW", "₩", "South Korean Won", 0],
    ["KWD", "KD", "Kuwaiti Dinar", 3],
    ["KZT", "₸", "Kazakhstani Tenge", 2],
    ["LBP", "LB£", "Lebanese Pound", 0],
    ["LKR", "SLRs", "Sri Lankan Rupee", 2],
    ["LTL", "Lt", "Lithuanian Litas", 2],
    ["LVL", "Ls", "Latvian Lats", 2],
    ["LYD", "LD", "Libyan Dinar", 3],
    ["MAD", "MAD", "Moroccan Dirham", 2],
    ["MDL", "MDL", "Moldovan Leu", 2],
    ["MGA", "MGA", "Malagasy Ariary", 0],
    ["MKD", "MKD", "Macedonian Denar", 2],
    ["MMK", "MMK", "Myanma Kyat", 0],
    ["MNT", "₮", "Mongolian Tugrik", 0],
    ["MOP", "MOP$", "Macanese Pataca", 2],
    ["MUR", "MURs", "Mauritian Rupee", 0],
    ["MXN", "MX$", "Mexican Peso", 2],
    ["MYR", "RM", "Malaysian Ringgit", 2],
    ["MZN", "MTn", "Mozambican Metical", 2],
    ["NAD", "N$", "Namibian Dollar", 2],
    ["NGN", "₦", "Nigerian Naira", 2],
    ["NIO", "C$", "Nicaraguan Córdoba", 2],
    ["NOK", "Nkr", "Norwegian Krone", 2],
    ["NPR", "NPRs", "Nepalese Rupee", 2],
    ["NZD", "NZ$", "New Zealand Dollar", 2],
    ["OMR", "OMR", "Omani Rial", 3],
    ["PAB", "B/.", "Panamanian Balboa", 2],
    ["PEN", "S/.", "Peruvian Nuevo Sol", 2],
    ["PHP", "₱", "Philippine Peso", 2],
    ["PKR", "PKRs", "Pakistani Rupee", 0],
    ["PLN", "zł", "Polish Zloty", 2],
    ["PYG", "₲", "Paraguayan Guarani", 0],
    ["QAR", "QR", "Qatari Rial", 2],
    ["RON", "RON", "Romanian Leu", 2],
    ["RSD", "din.", "Serbian Dinar", 0],
    ["RUB", "₽", "Russian Ruble", 2],
    ["RWF", "RWF", "Rwandan Franc", 0],
    ["SAR", "SR", "Saudi Riyal", 2],
    ["SDG", "SDG", "Sudanese Pound", 2],
    ["SEK", "Skr", "Swedish Krona", 2],
    ["SGD", "S$", "Singapore Dollar", 2],
    ["SOS", "Ssh", "Somali Shilling", 0],
    ["SYP", "SY£", "Syrian Pound", 0],
    ["THB", "฿", "Thai Baht", 2],
    ["TND", "DT", "Tunisian Dinar", 3],
    ["TOP", "T$", "Tongan Paʻanga", 2],
    ["TRY", "₺", "Turkish Lira", 2],
    ["TTD", "TT$", "Trinidad and Tobago Dollar", 2],
    ["TWD", "NT$", "New Taiwan Dollar", 2],
    ["TZS", "TSh", "Tanzanian Shilling", 0],
    ["UAH", "₴", "Ukrainian Hryvnia", 2],
    ["UGX", "USh", "Ugandan Shilling", 0],
    ["UYU", "$U", "Uruguayan Peso", 2],
    ["UZS", "UZS", "Uzbekistan Som", 0],
    ["VEF", "Bs.F.", "Venezuelan Bolívar", 2],
    ["VND", "₫", "Vietnamese Dong", 0],
    ["XAF", "FCFA", "CFA Franc BEAC", 0],
    ["XOF", "CFA", "CFA Franc BCEAO", 0],
    ["YER", "﷼", "Yemeni Rial", 0],
    ["ZAR", "R", "South African Rand", 2],
    ["ZMK", "ZK", "Zambian Kwacha", 0],
    ["ZWL", "ZWL$", "Zimbabwean Dollar", 0],
];
