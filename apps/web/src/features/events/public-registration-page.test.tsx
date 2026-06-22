import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { App } from "@/app/App";
import { server } from "@/test/server";

const API_BASE_URL = "http://localhost:3000/api";

describe("Public event registration", () => {
  it("submits consented lead data and shows the registration protocol", async () => {
    const user = userEvent.setup();
    let requestBody: unknown;

    server.use(
      http.get(`${API_BASE_URL}/public/events/event-1`, () =>
        HttpResponse.json({
          id: "event-1",
          name: "Vigil Summit",
          slug: "vigil-summit",
          description: "Seguranca para a era da IA.",
          location: "Sao Paulo, SP",
          startsAt: "2026-09-18T12:00:00.000Z",
          endsAt: "2026-09-18T21:00:00.000Z",
          timezone: "America/Sao_Paulo",
          capacity: 120,
          status: "PUBLISHED"
        })
      ),
      http.post(`${API_BASE_URL}/public/events/event-1/registrations`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json(
          {
            created: true,
            registrationId: "registration-1",
            leadId: "lead-1",
            status: "REGISTERED"
          },
          { status: 201 }
        );
      })
    );
    window.history.replaceState({}, "", "/events/event-1/register");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Vigil Summit" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nome completo"), "Mariana Costa");
    await user.type(screen.getByLabelText("E-mail corporativo"), "mariana@fintech.example");
    await user.type(screen.getByLabelText("Cargo"), "CISO");
    await user.type(screen.getByLabelText("Empresa"), "Fintech Example");
    await user.type(screen.getByLabelText("Dominio da empresa"), "fintech.example");
    await user.type(screen.getByLabelText("Temas de interesse"), "SOC 2, riscos de IA");
    await user.click(
      screen.getByLabelText("Aceito receber confirmacoes e informacoes operacionais sobre este evento.")
    );
    await user.click(
      screen.getByLabelText(
        "Aceito receber um contato comercial personalizado depois do evento. Opcional."
      )
    );
    await user.click(screen.getByRole("button", { name: "Inscrever-se" }));

    expect(await screen.findByRole("heading", { name: "Inscricao recebida" })).toBeInTheDocument();
    expect(screen.getByText("Protocolo: registration-1")).toBeInTheDocument();
    await waitFor(() => {
      expect(requestBody).toMatchObject({
        fullName: "Mariana Costa",
        workEmail: "mariana@fintech.example",
        companyDomain: "fintech.example",
        interestTopics: ["SOC 2", "riscos de IA"],
        eventCommunicationConsent: true,
        commercialFollowUpConsent: true
      });
    });
  });
});
