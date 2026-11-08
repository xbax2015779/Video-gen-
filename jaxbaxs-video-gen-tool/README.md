# Jaxbax's Video Gen Tool

A red-themed local web interface for the VidoGrid API. The VidoGrid key remains stored as a Cloudflare Worker secret. Your local Node server stores only the bridge secret in `.env` and does not expose it to browser JavaScript.

## Models covered by the newly supplied VidoGrid docs

**Video:** Veo 3.1, Veo 3.1 Fast, Omni 1.1 Flash, Grok Imagine Video 1.5, Grok Imagine Video 1.5 Lite, Muse AI Video.

**Image:** Nano Banana Pro, Nano Banana 2.1, Nano Banana 2 Lite, Grok Image, Grok Image v2, GPT Image 2.5.

This build uses the exact endpoint paths documented in the latest ZIP. It does not invent endpoints for models absent from those docs.

## 1. Update the Cloudflare Worker

The earlier Worker version may have used incorrect endpoint paths. Replace its `worker.js` with this project's `worker.js`, then from the folder containing `wrangler.toml`, run:

```cmd
wrangler deploy
```

Keep the two Worker secrets already configured:
- `VIDOGRID_API_KEY`
- `CHATGPT_ACTION_SECRET`

If you changed the secret, use the same new value in the local `.env` file below.

## 2. Set up the local website

Install Node.js 20 or newer. Extract this ZIP. In the extracted folder, copy `.env.example` to `.env`.

Open `.env` and set:

```env
WORKER_URL=https://vidogrid-chatgpt-bridge.lax00118.workers.dev
CHATGPT_ACTION_SECRET=PASTE_THE_SAME_BRIDGE_SECRET_HERE
PORT=3000
```

Do not put your VidoGrid API key in this file. It stays in Cloudflare Worker secrets. Do not share `.env` or upload it publicly.

## 3. Set a family login

In `.env`, change `APP_PASSWORD` to a long private password shared only with your household. The default username is `family`; change it with `APP_USERNAME` if desired. The browser will ask for this login when anyone opens the site. This helps prevent other devices on your Wi-Fi from using your VidoGrid credits.

## 4. Start the website for your whole home Wi-Fi

In the extracted folder, click the File Explorer address bar, type `cmd`, press Enter, then run:

```cmd
node server.js
```

On the host Windows PC, open another Command Prompt and run:

```cmd
ipconfig
```

Find the active Wi-Fi or Ethernet adapter and copy its **IPv4 Address**, usually similar to `192.168.1.25`.

- On the host PC, open `http://localhost:3000`.
- On each family member's phone, tablet, or computer connected to the **same home Wi-Fi**, open `http://YOUR-PC-IP:3000` (replace `YOUR-PC-IP` with the IPv4 address you found).
- Enter the family username and password when prompted.

If Windows Firewall asks whether Node.js can communicate on networks, allow it on **Private networks only**. If it was blocked earlier, open Windows Security → Firewall & network protection → Allow an app through firewall, and allow Node.js on Private networks. Do not enable this on Public networks.

Keep the host PC powered on, connected to the home network, and keep the Command Prompt window open. To stop the server, press Ctrl+C. If the PC's IPv4 address changes, run `ipconfig` again and use the new address.

## Safety and privacy

- The server listens on the local network but requires the family username/password for the website and API routes.
- Generations use your VidoGrid account credits, so only share the login with people you trust.
- Do not port-forward port 3000 on your router or expose this server directly to the public internet.
- Keep `.env` private. It contains your bridge secret and family password; never upload or send it.
- Other devices must be on the same home Wi-Fi, not mobile data or a guest network that blocks local-device access.

## Features in this build

- **Video generation** and **image generation** are available from separate tabs in the same studio. Image models include Nano Banana, Grok Image, and GPT Image options listed above. Availability depends on your VidoGrid plan and credits.
- **Shared generation queue**: all household members using the same home Wi-Fi login see the same locally stored queue. There is no profile picker or separate family profile feature.
- **Generation queue**: see recent jobs for the shared household queue and open their live status/result. Jobs are saved in `data/family-data.json` on the host PC.
- **Image-to-video**: use the starting-image button to switch to video mode, choose a reference image, and submit it with a supported reference-image video model. Reference-image support varies by model and VidoGrid endpoint.
- **Prompt assistant**: expand a short idea with a selectable style preset (cinematic, photorealistic, funny, security camera, anime, or product showcase). This runs locally in the browser and does not call an extra AI service.
- **Shared account history** is still loaded from VidoGrid and remains visible in the account history panel for all profiles.
- The local server listens on `0.0.0.0` so devices on your private home network can connect. Keep the family login enabled.

## Notes

- Each generation asks for confirmation because VidoGrid may lock credits when it accepts a request.
- Actual costs depend on model and settings. The API returns `estimated_credit` after submission; check the account balance first.
- Free-trial access is limited. The current docs say Nano Banana models are available on the free trial, while Grok Image and GPT Image 2.5 require paid plans. Video model availability and prices depend on the account and current benefits.
- Generated media URLs may expire. Download finished media promptly.
- This is a home-network UI, bound to `0.0.0.0` for devices on your LAN. It is not intended to be a public internet website.


## Family profile data

The local server automatically creates `data/family-data.json` the first time a job is submitted. It stores the household profiles and per-profile job records. Back up this file if you want to preserve the profile queues across reinstallations. Do not share the `.env` file.
