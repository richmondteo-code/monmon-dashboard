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
        rbob: 'RB=F',     // RBOB Gasoline (used as proxy for 92)
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
    
    // Add fuel oil estimates (0.5% and 380 sulphur)
    // These aren't on Yahoo Finance, so we estimate from Brent
    data.fo05 = estimateFuelOil05(data.brent?.price);
    data.fo380 = estimateFuelOil380(data.brent?.price);
    
    // Gasoline 92 (use RBOB as base, adjust slightly)
    data.gas92 = estimateGas92(data.rbob?.price);
    
    // Calculate cracks
    const cracks = {
        crack_92: calculateCrack(data.brent?.price, data.gas92?.price),
        crack_fo05: calculateCrack(data.brent?.price, data.fo05?.price),
        crack_fo380: calculateCrack(data.brent?.price, data.fo380?.price),
    };
    
    // Calculate spreads
    const spreads = {
        brent_wti: (data.brent?.price || 0) - (data.wti?.price || 0),
        // Calendar spreads (would need futures curve data - using estimates)
        wti_m1m2: data.wti?.price ? (data.wti.price * 0.008) : 0.50,
        wti_m1m6: data.wti?.price ? (data.wti.price * 0.035) : 2.30,
        rbob_m1m2: data.rbob?.price ? (data.rbob.price * 0.01) : 0.15,
        ...cracks
    };
    
    return {
        timestamp: new Date().toISOString(),
        wti: data.wti,
        brent: data.brent,
        rbob: data.rbob,
        gas92: data.gas92,
        fo05: data.fo05,
        fo380: data.fo380,
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

function estimateFuelOil05(brentPrice) {
    if (!brentPrice) brentPrice = 71.80;
    
    // FO 0.5% typically trades at a premium to Brent (cleaner fuel)
    // Estimate: Brent + $3-5/bbl
    const premium = 4.0;
    const price = brentPrice + premium;
    
    return {
        price: price,
        change: 0.50,
        changePercent: 0.67,
        previousClose: price - 0.50
    };
}

function estimateFuelOil380(brentPrice) {
    if (!brentPrice) brentPrice = 71.80;
    
    // FO 380 (high sulphur) typically trades at a discount to Brent
    // Estimate: Brent - $8-12/bbl
    const discount = 10.0;
    const price = brentPrice - discount;
    
    return {
        price: price,
        change: -0.30,
        changePercent: -0.48,
        previousClose: price + 0.30
    };
}

function estimateGas92(rbobPrice) {
    if (!rbobPrice) rbobPrice = 2.28;
    
    // 92 RON typically slightly lower than RBOB (which is ~87 octane US)
    // But Singapore 92 context - use RBOB as close proxy
    const adjustment = -0.02; // Slight discount
    const price = rbobPrice + adjustment;
    
    return {
        price: price,
        change: 0.03,
        changePercent: 1.35,
        previousClose: price - 0.03
    };
}

function getMockData(commodity) {
    // Fallback data if API fails
    const mockPrices = {
        wti: { price: 66.50, change: 0.80, changePercent: 1.22, previousClose: 65.70 },
        brent: { price: 71.80, change: 0.90, changePercent: 1.27, previousClose: 70.90 },
        rbob: { price: 2.28, change: 0.04, changePercent: 1.79, previousClose: 2.24 }
    };
    
    return mockPrices[commodity] || { price: 0, change: 0, changePercent: 0, previousClose: 0 };
}

function calculateCrack(crudePrice, productPrice) {
    if (!crudePrice || !productPrice) return 0;
    
    // If product is in $/gallon, convert to $/bbl
    let productBarrel = productPrice;
    if (productPrice < 10) { // Likely in $/gal
        productBarrel = productPrice * 42;
    }
    
    // Crack spread = Product - Crude
    return productBarrel - crudePrice;
}

app.listen(PORT, () => {
    console.log(`MonMon Dashboard running on port ${PORT}`);
});
