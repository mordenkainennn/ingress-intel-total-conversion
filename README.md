<div align="center">
  <img src="https://raw.githubusercontent.com/IITC-CE/ingress-intel-total-conversion/master/assets/IITC_circle.svg" alt="iitc logo" width="150px" />

# IITC-CE (Custom Fork)

---

IITC is a browser add-on that modifies the Ingress intel map. This repository is a custom fork maintained for personal plugin development and enhancements.

**[Repository](https://github.com/mordenkainennn/ingress-intel-total-conversion) | [Official Website](https://iitc.app/) | [Official Wiki](https://github.com/IITC-CE/ingress-intel-total-conversion/wiki)**
</div>

---

## Custom & Improved Plugins (Local Plugins)

All custom-built and enhanced plugins are located in the `local-plugins/` directory. These plugins are designed to provide advanced features and a better spatial memory layer for Ingress agents.

| Plugin | Features & Capabilities | Docs (Bilingual/Trilingual) |
| :--- | :--- | :--- |
| **Portal DB** | **The Infrastructure.** Creates a persistent IndexedDB of portals. Features **Move Detection** (warns if a portal is moved > 3m) and **Update Statistics**. | [CN](./local-plugins/portal-db/index_zh-cn.html) / [EN](./local-plugins/portal-db/index.html) / [JA](./local-plugins/portal-db/index_ja.html) |
| **Portal Afterimage** | **The Memory Layer.** Draws subtle "afterimages" of portals you've seen when zoomed out beyond the official display limit. *Requires Portal DB.* | [CN](./local-plugins/portal-afterimage/index_zh-cn.html) / [EN](./local-plugins/portal-afterimage/index.html) / [JA](./local-plugins/portal-afterimage/index_ja.html) |
| **Player Activity Log** | **Intel Tracking.** Logs player activities from COMM and visualizes movement trails on the map with time-based color coding. | [CN](./local-plugins/player-activity-log/index_zh-cn.html) / [EN](./local-plugins/player-activity-log/index.html) / [JA](./local-plugins/player-activity-log/index_ja.html) |
| **Recharge Monitor** | **Strategic Defense.** Real-time health monitoring and decay prediction. Syncs with Activity Log to "vacuum" deployment times. | [CN](./local-plugins/recharge-monitor/index_zh-cn.html) / [EN](./local-plugins/recharge-monitor/index.html) / [JA](./local-plugins/recharge-monitor/index_ja.html) |
| **Uniques Tools** | **History Tracking.** Enhanced version of "Uniques" with full Drone support, Scout Controller tracking, and official history import. | [CN](./local-plugins/uniques-tools/index_zh-cn.html) / [EN](./local-plugins/uniques-tools/index.html) / [JA](./local-plugins/uniques-tools/index_ja.html) |
| **All Portal Names** | **Visual Clarity.** Forces display of all portal names regardless of overlap at a user-defined zoom level threshold. | [CN](./local-plugins/all-portal-name/index_zh-cn.html) / [EN](./local-plugins/all-portal-name/index.html) / [JA](./local-plugins/all-portal-name/index_ja.html) |

---

## Project Conventions

To ensure clean maintenance and compatibility with upstream IITC-CE:

1.  **Do not modify `plugins/` directly.** All built-in plugins are kept in their original state.
2.  **Use `local-plugins/` for everything.** 
    -   If you want to improve an official plugin, copy it to `local-plugins/` first.
    -   All new custom plugins must be placed in `local-plugins/`.
3.  **Build System**: Use the standard build script to generate user scripts:
    ```bash
    python build.py local
    ```

---

## About IITC "Community Edition"

**IITC-CE** is a community-driven continuation of the original IITC project. It is faster than the standard site and offers many more features via its extensive plugin system.

### Users
- Install Official IITC: [https://iitc.app/](https://iitc.app/)
- Telegram News: [https://t.me/iitc_news](https://t.me/iitc_news)

### Developers
- [Contribution Guidelines](https://github.com/IITC-CE/ingress-intel-total-conversion/wiki/Contributing-to-IITC%E2%80%90CE)
- [Hacking Quickstart](https://github.com/IITC-CE/ingress-intel-total-conversion/wiki/HACKING)

---

*Note: This repository is for personal use and individual plugin development. No competition advantage is intended. **Portal DB and Portal Afterimage are based on locally received data only, do not interact with or upload to the server, and do not violate Niantic's TOS.** All features are based on data already received by the client.*
