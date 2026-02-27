const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;

// Serve static files
app.use(express.static(path.join(__dirname)));

// API endpoint for energy data
app.get('/api/energy-data', async (req, res) => {
    try {
        // Use Yahoo Finance for free commodity data
        const symbols = {
            wti: 'CL=F',      // WTI Crude
            brent: 'BZ=F',    // Brent Crude
            rbob: 'RB=F',     // RBOB Gasoline
            ho: 'HO=F'        // Heating Oil
        };
        
        const data = {};
        
        // Fetch data for each symbol
        for (const [key, symbol] of Object.entries(symbols)) {
            try {
                const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0'
                    }
                });
                
                const result = response.data.chart.result[0];
                const quote = result.meta;
                const closes = result.indicators.quote[0].close;
                
                // Get latest and previous close
                const latestPrice = quote.regularMarketPrice || closes[closes.length - 1];
                const previousClose = quote.previousClose || closes[closes.length - 2];
                
                const change = latestPrice - previousClose;
                const changePercent = (change / previousClose) * 100;
                
                data[key] = {
                    price: latestPrice,
                    change: change,
                    changePercent: changePercent,
                    previousClose: previousClose
                };
            } catch (error) {
                console.error(`Error fetching ${key}:`, error.message);
                data[key] = {
                    price: 0,
                    change: 0,
                    changePercent: 0
                };
            }
        }
        
        // Calculate spreads
        const spreads = {
            brent_wti: (data.brent?.price || 0) - (data.wti?.price || 0),
            crack_321: calculateCrack321(data.wti?.price, data.rbob?.price, data.ho?.price),
            // Placeholder for calendar spreads (would need futures data)
            wti_m1m2: 0.50,
            wti_m1m6: 2.30,
            rbob_m1m2: 0.15,
            ho_m1m2: 0.20
        };
        
        res.json({
            timestamp: new Date().toISOString(),
            wti: data.wti,
            brent: data.brent,
            rbob: data.rbob,
            heatingOil: data.ho,
            spreads: spreads
        });
        
    } catch (error) {
        console.error('Error in API:', error);
        res.status(500).json({ error: 'Failed to fetch energy data' });
    }
});

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
    console.log(`MonMon Dashboard running on http://localhost:${PORT}`);
    console.log(`Access it on your phone at: http://<your-ip>:${PORT}`);
});
