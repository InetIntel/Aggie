// limit on number of records fetched from api
const API_MAX_RESULTS = {
    CLOUDFLARE: 50
}

const API_BASE_URLS = {
    IODA: process.env.IODA_API_BASE_URL || 'https://api.ioda.inetintel.cc.gatech.edu/v2/',
    CLOUDFLARE: process.env.GEO_API_BASE_URL || 'https://api.cloudflare.com/client/v4/radar/',
    
}

const API_ROUTES = {
    IODA: {
        ENTITY_QUERY:'entities/query',
        OUTAGE_EVENTS:'outages/events',
    },
    
    CLOUDFLARE:{
        TRAFFIC_ANOMALIES:'traffic_anomalies',
    }
}

const DATA_SOURCES = {
    IODA: {
        'merit-nt': 'Telescope',
        'ping-slash24': 'Active Probing',
        'bgp': 'BGP',
    },
    CLOUDFLARE: "Cloudflare Traffic"
}

const API_LINKED_PAGE_URLS = {
    IODA:{
        BASE: 'https://ioda.inetintel.cc.gatech.edu',
    },
    CLOUDFLARE: {
        BASE: "https://radar.cloudflare.com",
        IMAGE_ROUTE: "charts/TrafficTrendsXY/png?image=true"
    }
    
}

module.exports = {
    API_MAX_RESULTS,
    API_BASE_URLS,
    API_ROUTES,
    DATA_SOURCES,
    API_LINKED_PAGE_URLS,

}