import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "orchestrator" });
});

app.post("/tasks", (req, res) => {
  res.status(202).json({ accepted: true, payload: req.body });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`orchestrator listening on ${port}`);
});
