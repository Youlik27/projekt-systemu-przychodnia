import { config } from "./config.js";
import { createApp } from "./app.js";
import { startReminderScheduler } from "./services/reminder.service.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`API running on http://localhost:${config.port}`);

  // WF-12: cykliczne przypomnienia SMS (wyłączenie: REMINDERS_ENABLED=false w .env)
  startReminderScheduler();
});
