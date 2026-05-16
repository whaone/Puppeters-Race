const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// -------------------------------------------------------
// HTML Frontend UI 
// -------------------------------------------------------
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Strava Beacon Realtime Tracker</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f5f6; margin: 0; padding: 40px; display: flex; justify-content: center; }
            .container { width: 100%; max-width: 600px; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
            h1 { color: #FC4C02; margin-top: 0; font-size: 24px; display: flex; align-items: center; gap: 10px; }
            label { display: block; font-weight: bold; margin-bottom: 8px; color: #333; }
            input[type="text"] { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 16px; margin-bottom: 15px; transition: border-color 0.2s; }
            input[type="text"]:focus { border-color: #FC4C02; outline: none; }
            button { background: #FC4C02; color: white; border: none; padding: 12px 20px; font-size: 16px; font-weight: bold; border-radius: 6px; cursor: pointer; width: 100%; transition: background 0.2s; }
            button:hover { background: #e34402; }
            button:disabled { background: #ccc; cursor: not-allowed; }
            #status { margin-top: 15px; font-weight: bold; color: #e34402; font-size: 14px; padding: 10px; background: #fff5f2; border-radius: 6px; border-left: 4px solid #FC4C02; }
            
            #data-display { margin-top: 25px; border-top: 2px solid #eee; padding-top: 20px; display: none; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .metric-card { background: #fafafa; border-left: 4px solid #FC4C02; padding: 12px; border-radius: 0 6px 6px 0; }
            .metric-card.full { grid-column: span 2; }
            .metric-title { font-size: 12px; text-transform: uppercase; color: #888; font-weight: bold; }
            .metric-value { font-size: 18px; font-weight: bold; color: #222; margin-top: 4px; }
            .timestamp { text-align: right; font-size: 11px; color: #999; margin-top: 15px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚴 Strava Beacon Tracker</h1>
            <form id="tracker-form">
                <label for="beaconUrl">Paste Strava Beacon Link:</label>
                <input type="text" id="beaconUrl" placeholder="https://www.strava.com/beacon/..." required>
                <button type="submit" id="submit-btn">Start Live Tracking</button>
            </form>
            
            <div id="status">Ready. Enter a link to begin...</div>

            <div id="data-display">
                <div class="grid">
                    <div class="metric-card full">
                        <div class="metric-title">📍 Coordinates (Lat, Lng)</div>
                        <div class="metric-value" id="val-coords">Awaiting movement...</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-title">📏 Distance</div>
                        <div class="metric-value" id="val-distance">-</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-title">🔋 Phone Battery</div>
                        <div class="metric-value" id="val-battery">-</div>
                    </div>
                </div>
                <div class="timestamp" id="val-time">Last update: Never</div>
            </div>
        </div>

        <script>
            const form = document.getElementById('tracker-form');
            const submitBtn = document.getElementById('submit-btn');
            const statusDiv = document.getElementById('status');
            const dataDisplay = document.getElementById('data-display');
            
            let eventSource = null;

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const url = document.getElementById('beaconUrl').value.trim();
                if (!url) return;

                if (eventSource) eventSource.close();

                statusDiv.innerText = "⏳ Initializing connection...";
                statusDiv.style.color = "#e34402";
                statusDiv.style.background = "#fff5f2";
                statusDiv.style.borderLeftColor = "#FC4C02";
                submitBtn.disabled = true;

                eventSource = new EventSource('/stream?url=' + encodeURIComponent(url));

                eventSource.onmessage = (event) => {
                    const message = JSON.parse(event.data);
                    
                    if (message.status === 'log') {
                        statusDiv.innerText = "ℹ️ " + message.payload;
                    }
                    else if (message.status === 'connected') {
                        statusDiv.innerText = "🟢 Connected! Intercepting Strava data...";
                        statusDiv.style.color = "green";
                        statusDiv.style.background = "#f2fdf2";
                        statusDiv.style.borderLeftColor = "green";
                        dataDisplay.style.display = "block";
                    } 
                    else if (message.status === 'data') {
                        const data = message.payload;
                        
                        // Only update coordinates if the user has actually moved
                        if (data.latitude && data.longitude) {
                            document.getElementById('val-coords').innerText = data.latitude + ', ' + data.longitude;
                            statusDiv.innerText = "⚡ Athlete is moving! Receiving live tracking data.";
                        } else {
                            statusDiv.innerText = "📡 Receiving updates (Athlete is currently stationary).";
                        }
                        
                        // Update secondary stats
                        if (data.distance) document.getElementById('val-distance').innerText = data.distance;
                        if (data.battery) document.getElementById('val-battery').innerText = data.battery;
                        
                        // Format the timestamp nicely
                        let timeString = new Date().toLocaleTimeString();
                        if (data.timestamp) {
                            timeString = new Date(data.timestamp * 1000).toLocaleTimeString(); // Strava uses UNIX seconds
                        }
                        document.getElementById('val-time').innerText = 'Last ping: ' + timeString;
                    }
                    else if (message.status === 'error') {
                        statusDiv.innerText = "❌ Error: " + message.payload;
                        statusDiv.style.color = "red";
                        statusDiv.style.background = "#fdf2f2";
                        statusDiv.style.borderLeftColor = "red";
                        submitBtn.disabled = false;
                        eventSource.close();
                    }
                };

                eventSource.onerror = (err) => {
                    statusDiv.innerText = "❌ Connection lost.";
                    submitBtn.disabled = false;
                    eventSource.close();
                };
            });
        </script>
    </body>
    </html>
  `);
});

// -------------------------------------------------------
// Backend Real-time Data Streaming Route (SSE)
// -------------------------------------------------------
app.get("/stream", async (req, res) => {
  const targetUrl = req.query.url;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendToUI = (status, payload = "") => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ status, payload })}\n\n`);
  };

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": heartbeat ping\n\n");
  }, 10000);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    // HTTP Interceptor targeted explicitly at the JSON you provided
    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("strava.com") && url.includes("beacon")) {
        const contentType = response.headers()["content-type"] || "";
        if (contentType.includes("application/json")) {
          try {
            const json = await response.json();
            const extracted = parseStravaBeaconJson(json);
            if (extracted) {
              sendToUI("data", extracted);
            }
          } catch (e) {}
        }
      }
    });

    sendToUI("log", "Navigating to Strava Beacon webpage...");
    await page.goto(targetUrl, { waitUntil: "networkidle2" });
    sendToUI("connected");

    await new Promise((resolve) => {
      req.on("close", () => resolve());
    });

  } catch (error) {
    sendToUI("error", error.message);
  } finally {
    clearInterval(heartbeat);
    if (browser) await browser.close();
    res.end();
  }
});

// -------------------------------------------------------
// Custom Parser strictly built for Strava's current API structure
// -------------------------------------------------------
function parseStravaBeaconJson(obj) {
  if (!obj || typeof obj !== "object") return null;

  // Verify this is the specific Strava payload we are looking for
  if (obj.live_activity_id !== undefined || obj.streams !== undefined) {
    let result = {
      latitude: null,
      longitude: null,
      distance: null,
      battery: null,
      timestamp: obj.update_time || null
    };

    // 1. Extract Battery
    if (obj.battery_level !== undefined) {
      result.battery = obj.battery_level + "%";
    }

    // 2. Extract Distance (Convert meters to km)
    if (obj.stats && obj.stats.distance !== undefined) {
      const distKm = (obj.stats.distance / 1000).toFixed(2);
      result.distance = distKm + " km";
    }

    // 3. Extract Coordinates (Only if the athlete has moved)
    if (obj.streams && Array.isArray(obj.streams.latlng) && obj.streams.latlng.length > 0) {
      const latlngArray = obj.streams.latlng;
      const lastIndex = latlngArray.length - 1;
      
      result.latitude = latlngArray[lastIndex][0];
      result.longitude = latlngArray[lastIndex][1];

      // Update timestamp to the exact moment of the coordinate if available
      if (Array.isArray(obj.streams.timestamp) && obj.streams.timestamp.length > 0) {
        result.timestamp = obj.streams.timestamp[lastIndex];
      }
    }

    return result;
  }

  return null; // Not the correct JSON packet
}

// Start Server
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
});