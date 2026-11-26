
import { useEffect, useMemo, useState } from "react";
import { Bar, Doughnut } from "react-chartjs-2";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
} from "chart.js";

import { ApiError, addDays, toIsoDate } from "../api";
import {
  getStaffReport,
  type StaffReport
} from "../staffApi";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

interface Props {
  token: string;
}

export default function ReportsTab({ token }: Props) {
  const today = toIsoDate(new Date());

  const [from, setFrom] = useState(
    () => addDays(today, -29)
  );

  const [to, setTo] = useState(today);

  const [report, setReport] = useState<StaffReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async (
    start = from,
    end = to
  ) => {
    setLoading(true);
    setError("");

    try {
      const data = await getStaffReport(token, start, end);
      setReport(data);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Nie udało się pobrać raportu."
      );
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const statusData = useMemo(() => ({
    labels: [
      "Aktywne",
      "Zakończone",
      "Anulowane",
      "Nieobecności"
    ],
    datasets: [{
      data: report
        ? [
            report.summary.active,
            report.summary.completed,
            report.summary.cancelled,
            report.summary.no_show
          ]
        : [],
      backgroundColor: [
        "#2878b8",
        "#29965b",
        "#d18a27",
        "#bd4545"
      ]
    }]
  }), [report]);

  const doctorData = useMemo(() => ({
    labels: report?.doctors.map(
      d => `dr ${d.firstName} ${d.lastName}`
    ) ?? [],
    datasets: [{
      label: "Liczba wizyt",
      data: report?.doctors.map(d => d.total) ?? [],
      backgroundColor: "#2878b8"
    }]
  }), [report]);

  const exportCsv = () => {
    if (!report) return;

    const rows = [
      [
        "Lekarz",
        "Specjalizacja",
        "Wszystkie",
        "Aktywne",
        "Zakończone",
        "Anulowane",
        "Nieobecności"
      ],
      ...report.doctors.map(d => [
        `dr ${d.firstName} ${d.lastName}`,
        d.specialization,
        d.total,
        d.active,
        d.completed,
        d.cancelled,
        d.no_show
      ])
    ];

    const csv =
      "\uFEFF" +
      rows.map(row =>
        row.map(cell =>
          `"${String(cell ?? "").replace(/"/g, '""')}"`
        ).join(";")
      ).join("\r\n");

    const url = URL.createObjectURL(
      new Blob([csv], {
        type: "text/csv;charset=utf-8;"
      })
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = `raport-${from}-${to}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="staff-tab">

      <form
        className="card filters"
        onSubmit={e => {
          e.preventDefault();
          void load();
        }}
      >
        <div className="field">
          <label htmlFor="report-from" className="field__label">
            Data od
          </label>

          <input
            id="report-from"
            type="date"
            className="field__control"
            value={from}
            max={to}
            onChange={e => setFrom(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="report-to" className="field__label">
            Data do
          </label>

          <input
            id="report-to"
            type="date"
            className="field__control"
            value={to}
            min={from}
            max={today}
            onChange={e => setTo(e.target.value)}
          />
        </div>

        <div className="actions actions--start">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading}
          >
            Generuj raport
          </button>

          <button
            type="button"
            className="btn btn--secondary"
            disabled={loading}
            onClick={() => {
              const start = addDays(today, -29);
              setFrom(start);
              setTo(today);
              void load(start, today);
            }}
          >
            Ostatnie 30 dni
          </button>
        </div>
      </form>

      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}

      {loading && (
        <p className="loading" role="status">
          Pobieranie danych raportu...
        </p>
      )}

      {report && (
        <>
          <section className="report-cards">
            <article className="card report-card">
              <span>Wszystkie wizyty</span>
              <strong>{report.summary.total}</strong>
            </article>

            <article className="card report-card">
              <span>Aktywne</span>
              <strong>{report.summary.active}</strong>
            </article>

            <article className="card report-card">
              <span>Zakończone</span>
              <strong>{report.summary.completed}</strong>
            </article>

            <article className="card report-card">
              <span>Anulowane</span>
              <strong>{report.summary.cancelled}</strong>
            </article>

            <article className="card report-card">
              <span>Nieobecności</span>
              <strong>{report.summary.no_show}</strong>
            </article>
          </section>

          <section className="card">
            <h2 className="section-title">
              Wizyty według statusu
            </h2>

            {report.summary.total === 0 ? (
              <p className="alert alert--info">
                Brak wizyt w wybranym okresie.
              </p>
            ) : (
              <div className="report-chart report-chart--doughnut">
                <Doughnut
                  data={statusData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false
                  }}
                />
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="section-title">
              Wizyty według lekarzy
            </h2>

            <div className="report-chart">
              <Bar
                data={doctorData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: { precision: 0 }
                    }
                  }
                }}
              />
            </div>
          </section>

          <section className="card">
            <div className="actions">
              <h2 className="section-title">
                Zestawienie lekarzy
              </h2>

              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={exportCsv}
              >
                Eksportuj CSV
              </button>
            </div>

            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Lekarz</th>
                    <th>Specjalizacja</th>
                    <th>Wszystkie</th>
                    <th>Aktywne</th>
                    <th>Zakończone</th>
                    <th>Anulowane</th>
                    <th>Nieobecności</th>
                  </tr>
                </thead>

                <tbody>
                  {report.doctors.map(d => (
                    <tr key={d.doctorId}>
                      <th>
                        dr {d.firstName} {d.lastName}
                      </th>
                      <td>{d.specialization}</td>
                      <td>{d.total}</td>
                      <td>{d.active}</td>
                      <td>{d.completed}</td>
                      <td>{d.cancelled}</td>
                      <td>{d.no_show}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
