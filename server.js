const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Cache for data (to avoid rate limits)
let cachedData = null;
let lastFetch = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// API endpoint for energy data
app.get('/api/energy-data', async (req, res) => {
    try {
        // Return cached data if recent
        const now = Date.now();
        if (cachedData && (now - lastFetch) < CACHE_DURATION) {
            return res.json(cachedData);
        }

        // Fetch fresh data
        const data = await fetchEnergyData();
        
        cachedData = data;
        lastFetch = now;
        
        res.json(data);
        
    } catch (error) {
        console.error('Error in API:', error);
        
        // Return cached data if available, even if stale
        if (cachedData) {
            return res.json(cachedData);
        }
        
        res.status(500).json({ error: 'Failed to fetch energy data' });
    }
});

async function fetchEnergyData() {
    const symbols = {
        wti: 'CL=F',      // WTI Crude
        brent: 'BZ=F',    // Brent Crude
        rbob: 'RB=F',     // RBOB Gasoline
        ho: 'HO=F'        // Heating Oil
    };
    
    const data = {};
    
    // Fetch data for each symbol with retry logic
    for (const [key, symbol] of Object.entries(symbols)) {
        try {
            const price = await fetchYahooPrice(symbol);
            data[key] = price;
        } catch (error) {
            console.error(`Error fetching ${key}:`, error.message);
            // Use fallback/mock data if fetch fails
            data[key] = getMockData(key);
        }
    }
    
    // Calculate spreads
    const spreads = {
        brent_wti: (data.brent?.price || 0) - (data.wti?.price || 0),
        crack_321: calculateCrack321(data.wti?.price, data.rbob?.price, data.ho?.price),
        // Calendar spreads (would need futures curve data - using estimates)
        wti_m1m2: data.wti?.price ? (data.wti.price * 0.008) : 0.50,  // ~0.8% backwardation
        wti_m1m6: data.wti?.price ? (data.wti.price * 0.035) : 2.30,  // ~3.5% backwardation
        rbob_m1m2: data.rbob?.price ? (data.rbob.price * 0.01) : 0.15,
        ho_m1m2: data.ho?.price ? (data.ho.price * 0.008) : 0.20
    };
    
    return {
        timestamp: new Date().toISOString(),
        wti: data.wti,
        brent: data.brent,
        rbob: data.rbob,
        heatingOil: data.ho,
        spreads: spreads
    };
}

async function fetchYahooPrice(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
    
    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
        },
        timeout: 10000
    });
    
    if (!response.data?.chart?.result?.[0]) {
        throw new Error('Invalid response structure');
    }
    
    const result = response.data.chart.result[0];
    const quote = result.meta;
    const closes = result.indicators?.quote?.[0]?.close || [];
    
    // Get latest and previous close
    let latestPrice = quote.regularMarketPrice;
    if (!latestPrice || latestPrice === 0) {
        // Fallback to last close in array
        latestPrice = closes[closes.length - 1];
    }
    
    const previousClose = quote.previousClose || closes[closes.length - 2];
    
    const change = latestPrice - previousClose;
    const changePercent = (change / previousClose) * 100;
    
    return {
        price: latestPrice,
        change: change,
        changePercent: changePercent,
        previousClose: previousClose
    };
}

function getMockData(commodity) {
    // Fallback data if API fails
    const mockPrices = {
        wti: { price: 66.50, change: 0.80, changePercent: 1.22, previousClose: 65.70 },
        brent: { price: 71.80, change: 0.90, changePercent: 1.27, previousClose: 70.90 },
        rbob: { price: 2.28, change: 0.04, changePercent: 1.79, previousClose: 2.24 },
        ho: { price: 2.55, change: -0.03, changePercent: -1.16, previousClose: 2.58 }
    };
    
    return mockPrices[commodity] || { price: 0, change: 0, changePercent: 0, previousClose: 0 };
}

function calculateCrack321(wti, rbob, ho) {
    if (!wti || !rbob || !ho) return 0;
    
    // 3-2-1 crack: (2 * RBOB + 1 * HO) / 3 - WTI
    // Prices are in $/barrel for crude, $/gallon for products
    // Convert products to barrel equivalent (42 gallons)
    const rbobBarrel = rbob * 42;
    const hoBarrel = ho * 42;
    
    return ((2 * rbobBarrel + hoBarrel) / 3) - wti;
}

app.listen(PORT, () => {
    console.log(`MonMon Dashboard running on port ${PORT}`);
});
