import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Loader2, MapPin, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useParams } from "react-router-dom";
import { z } from "zod";

import { getPublicEvent, registerForEvent } from "@/shared/api/events";
import { ApiError } from "@/shared/api/http";
import { queryKeys } from "@/shared/api/query-keys";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";

const privacyNoticeVersion = "2026-06-20";

export const publicRegistrationSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome completo.").max(120),
  workEmail: z.string().trim().email("Informe um e-mail corporativo valido.").max(254),
  jobTitle: z.string().trim().max(120).optional(),
  companyName: z.string().trim().min(2, "Informe sua empresa.").max(160),
  companyDomain: z
    .string()
    .trim()
    .max(253)
    .refine(
      (value) => value.length === 0 || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value),
      "Informe um dominio valido."
    ),
  interestTopics: z.string().max(500),
  eventCommunicationConsent: z.boolean().refine((value) => value, {
    message: "O aceite e necessario para concluir a inscricao."
  }),
  commercialFollowUpConsent: z.boolean()
});

type PublicRegistrationForm = z.infer<typeof publicRegistrationSchema>;

export function PublicRegistrationPage() {
  const { eventId = "" } = useParams();
  const eventQuery = useQuery({
    queryKey: queryKeys.publicEvent(eventId),
    queryFn: () => getPublicEvent(eventId),
    enabled: Boolean(eventId),
    retry: false
  });
  const form = useForm<PublicRegistrationForm>({
    resolver: zodResolver(publicRegistrationSchema),
    defaultValues: {
      fullName: "",
      workEmail: "",
      jobTitle: "",
      companyName: "",
      companyDomain: "",
      interestTopics: "",
      eventCommunicationConsent: false,
      commercialFollowUpConsent: false
    }
  });
  const registrationMutation = useMutation({
    mutationFn: (values: PublicRegistrationForm) =>
      registerForEvent(eventId, {
        fullName: values.fullName,
        workEmail: values.workEmail,
        ...(values.jobTitle ? { jobTitle: values.jobTitle } : {}),
        companyName: values.companyName,
        ...(values.companyDomain ? { companyDomain: values.companyDomain } : {}),
        interestTopics: values.interestTopics
          .split(",")
          .map((topic) => topic.trim())
          .filter(Boolean),
        privacyNoticeVersion,
        eventCommunicationConsent: true,
        commercialFollowUpConsent: values.commercialFollowUpConsent
      })
  });

  if (eventQuery.isLoading) {
    return <RegistrationSkeleton />;
  }

  if (eventQuery.isError || !eventQuery.data) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Evento indisponivel</CardTitle>
            <CardDescription>
              Este evento nao esta publicado ou o link de inscricao nao e valido.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const event = eventQuery.data;
  const registration = registrationMutation.data;

  if (registration) {
    const isWaitlisted = registration.status === "WAITLISTED";

    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="w-full max-w-xl">
          <CardHeader className="items-center text-center">
            <CheckCircle2 className="size-12 text-emerald-500" />
            <CardTitle>{isWaitlisted ? "Voce esta na lista de espera" : "Inscricao recebida"}</CardTitle>
            <CardDescription>
              {isWaitlisted
                ? "Avisaremos por e-mail quando uma vaga estiver disponivel."
                : "Enviaremos a confirmacao e os proximos detalhes para o seu e-mail."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Protocolo: {registration.registrationId}
          </CardContent>
        </Card>
      </main>
    );
  }

  const submitError = registrationMutation.error;

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <section className="space-y-6 py-4">
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" />
            Evento corporativo exclusivo
          </div>
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Vigil.AI</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">{event.name}</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              {event.description ??
                "Conteudo executivo, demonstracoes praticas e conversas sobre seguranca para a era da IA."}
            </p>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <CalendarDays className="size-5 text-primary" />
              <span>{formatEventDate(event.startsAt, event.timezone)}</span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <MapPin className="size-5 text-primary" />
              <span>{event.location ?? "Local informado na confirmacao"}</span>
            </div>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Reserve seu lugar</CardTitle>
            <CardDescription>
              Usaremos seus dados para confirmar a participacao e personalizar a experiencia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={form.handleSubmit((values) => registrationMutation.mutate(values))}>
              <FormField label="Nome completo" error={form.formState.errors.fullName?.message}>
                <Input autoComplete="name" {...form.register("fullName")} />
              </FormField>
              <FormField label="E-mail corporativo" error={form.formState.errors.workEmail?.message}>
                <Input autoComplete="email" type="email" {...form.register("workEmail")} />
              </FormField>
              <FormField label="Cargo" error={form.formState.errors.jobTitle?.message}>
                <Input autoComplete="organization-title" {...form.register("jobTitle")} />
              </FormField>
              <FormField label="Empresa" error={form.formState.errors.companyName?.message}>
                <Input autoComplete="organization" {...form.register("companyName")} />
              </FormField>
              <FormField label="Dominio da empresa" error={form.formState.errors.companyDomain?.message}>
                <Input placeholder="empresa.com.br" {...form.register("companyDomain")} />
              </FormField>
              <FormField label="Temas de interesse" error={form.formState.errors.interestTopics?.message}>
                <Input placeholder="SOC 2, LGPD, riscos de IA" {...form.register("interestTopics")} />
              </FormField>

              <label className="flex items-start gap-3 text-sm">
                <input className="mt-1" type="checkbox" {...form.register("eventCommunicationConsent")} />
                <span>
                  Aceito receber confirmacoes e informacoes operacionais sobre este evento.
                </span>
              </label>
              {form.formState.errors.eventCommunicationConsent ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.eventCommunicationConsent.message}
                </p>
              ) : null}

              <label className="flex items-start gap-3 text-sm text-muted-foreground">
                <input className="mt-1" type="checkbox" {...form.register("commercialFollowUpConsent")} />
                <span>
                  Aceito receber um contato comercial personalizado depois do evento. Opcional.
                </span>
              </label>

              {submitError ? (
                <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {submitError instanceof ApiError ? submitError.message : "Nao foi possivel concluir a inscricao."}
                </p>
              ) : null}

              <Button className="w-full" disabled={registrationMutation.isPending} type="submit">
                {registrationMutation.isPending ? <Loader2 className="animate-spin" /> : null}
                Inscrever-se
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Voce pode retirar seus consentimentos a qualquer momento. <a className="underline" href="/privacy" target="_blank" rel="noreferrer">Aviso de privacidade {privacyNoticeVersion}</a>.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function FormField({
  children,
  error,
  label
}: {
  children: ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="block space-y-2">
        <span className="block">{label}</span>
        {children}
      </Label>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function RegistrationSkeleton() {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl gap-6 p-6 lg:grid-cols-2">
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-[36rem] w-full" />
    </main>
  );
}

function formatEventDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: timezone
  }).format(new Date(value));
}
