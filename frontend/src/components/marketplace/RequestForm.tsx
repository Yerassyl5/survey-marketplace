"use client";

/* ────────────────────────────────────────────────────────────────────────
   RequestForm.tsx — форма создания заявки заказчиком. ОДИН экран (не
   визард — решение пользователя: форма недостаточно длинная, чтобы дробить
   на шаги), секции визуально разделены карточками. Порядок полей сверху
   вниз — тоже решение пользователя: сначала «что за работа», объект и его
   геометрия — в самом низу, последним блоком.
   ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/button";
import { FilePicker } from "@/components/ui/FilePicker";
import { FormField } from "@/components/ui/FormField";
import { LocationCascadeSelect } from "@/components/ui/LocationCascadeSelect";
import type { LocationValue } from "@/components/ui/LocationCascadeSelect";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { WORK_TYPE_LABELS } from "@/components/ui/RequestRow";
import { EMPTY_NEW_SITE, SiteFields, validateSiteFields } from "@/components/marketplace/SiteFields";
import type { SiteFieldsValue } from "@/components/marketplace/SiteFields";
import { useRouter as useI18nRouter } from "@/i18n/navigation";
import { AuthRequiredError } from "@/lib/api/client";
import { getLocations } from "@/lib/api/geo";
import type { GeoLocations } from "@/lib/api/geo";
import { createRequest } from "@/lib/api/marketplace";
import type { WorkType } from "@/lib/api/marketplace";
import { createSite, getSites, uploadSiteGeometry } from "@/lib/api/sites";
import type { Site } from "@/lib/api/sites";
import { ApiError } from "@/lib/api/types";

const WORK_TYPES = Object.keys(WORK_TYPE_LABELS) as WorkType[];
const CONTRACTOR_NOTE_MAX = 300;

function Section({ title, children }: { title: string; children: ReactNode }) {
  const style: CSSProperties = {
    padding: 24,
    background: "var(--ds-bg-white)",
    border: "1px solid var(--ds-border)",
    borderRadius: "var(--ds-r-lg)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };
  return (
    <div style={style}>
      <h2 style={{ fontFamily: "var(--ds-font-heading)", fontSize: 16, fontWeight: 700, color: "var(--ds-text)", margin: 0 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

export function RequestForm() {
  const i18nRouter = useI18nRouter();

  const [workType, setWorkType] = useState<WorkType | "">("");
  const [location, setLocation] = useState<LocationValue>({ cityId: null, districtId: null });
  const [description, setDescription] = useState("");
  const [tzFile, setTzFile] = useState<File | null>(null);
  const [contractorNote, setContractorNote] = useState("");
  const [site, setSite] = useState<SiteFieldsValue>({ mode: "new", site: EMPTY_NEW_SITE });

  const [locations, setLocations] = useState<GeoLocations | null>(null);
  const [sites, setSites] = useState<Site[] | null>(null);

  useEffect(() => {
    getLocations().then(setLocations).catch(() => {});
    getSites().then(setSites).catch(() => setSites([]));
  }, []);

  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | null>(null);

  // Состояние ретрая: если создание заявки упало ПОСЛЕ того, как новый Site
  // уже создан (и, может быть, геометрия уже уточнена файлом) — при повторной
  // отправке эти шаги не повторяются, используется уже созданный site.
  const [createdSiteId, setCreatedSiteId] = useState<number | null>(null);
  const [siteGeometryUploaded, setSiteGeometryUploaded] = useState(false);

  const siteErrors = validateSiteFields(site);
  const workTypeError = (hasAttemptedSubmit && !workType ? "Выберите тип работ." : undefined) ?? fieldErrors?.work_type;
  const locationError =
    (hasAttemptedSubmit && location.cityId == null && location.districtId == null
      ? "Выберите город или район."
      : undefined) ?? fieldErrors?.city ?? fieldErrors?.district;
  const descriptionError = (hasAttemptedSubmit && !description.trim() ? "Опишите объём работ." : undefined) ?? fieldErrors?.description;
  const shownSiteErrors = {
    ...(hasAttemptedSubmit ? siteErrors : {}),
    selection: (hasAttemptedSubmit ? siteErrors.selection : undefined) ?? fieldErrors?.site,
  };

  function hasBlockingErrors(): boolean {
    return Boolean(
      !workType ||
        (location.cityId == null && location.districtId == null) ||
        !description.trim() ||
        siteErrors.selection ||
        siteErrors.address ||
        siteErrors.point,
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    setFormError(null);
    setFieldErrors(null);

    if (hasBlockingErrors()) return;

    setIsSubmitting(true);
    try {
      let siteId: number;
      if (site.mode === "existing") {
        siteId = site.siteId as number;
      } else if (createdSiteId != null) {
        siteId = createdSiteId;
      } else {
        const created = await createSite({
          address: site.site.address.trim(),
          cadastral_number: site.site.cadastralNumber.trim() || undefined,
          geometry: { type: "Point", coordinates: [site.site.point!.lng, site.site.point!.lat] },
        });
        siteId = created.id;
        setCreatedSiteId(siteId);
      }

      if (site.mode === "new" && site.site.file && !siteGeometryUploaded) {
        await uploadSiteGeometry(siteId, site.site.file);
        setSiteGeometryUploaded(true);
      }

      const created = await createRequest({
        site: siteId,
        work_type: workType as WorkType,
        description: description.trim(),
        location_type: location.cityId != null ? "city" : "district",
        city_id: location.cityId,
        district_id: location.districtId,
        contractor_note: contractorNote.trim() || undefined,
        tz_file: tzFile,
      });

      i18nRouter.push(`/requests/${created.id}`);
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        i18nRouter.replace("/login");
        return;
      }
      if (err instanceof ApiError) {
        if (err.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [key, messages] of Object.entries(err.fieldErrors)) {
            flat[key] = messages[0];
          }
          setFieldErrors(flat);
        }
        setFormError(err.message);
      } else {
        setFormError("Не удалось создать заявку. Попробуйте ещё раз.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {formError && <Alert variant="error">{formError}</Alert>}

      <Section title="Тип работ">
        <FormField id="request-work-type" label="Тип работ" required error={workTypeError}>
          <Select value={workType} onChange={(e) => setWorkType(e.target.value as WorkType)} hasError={Boolean(workTypeError)}>
            <option value="">Выберите тип работ</option>
            {WORK_TYPES.map((wt) => (
              <option key={wt} value={wt}>
                {WORK_TYPE_LABELS[wt]}
              </option>
            ))}
          </Select>
        </FormField>
      </Section>

      <Section title="Локация">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <LocationCascadeSelect
            locations={locations}
            value={location}
            onChange={setLocation}
            allowEmpty={false}
            error={locationError}
            idPrefix="new-request"
          />
        </div>
      </Section>

      <Section title="Описание">
        <FormField id="request-description" label="Описание объёма работ" required error={descriptionError}>
          <Textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Например: топографическая съёмка участка 10 соток под ИЖС, нужен план М1:500…"
          />
        </FormField>
      </Section>

      <Section title="Техническое задание">
        <FormField id="request-tz-file" label="Файл ТЗ (необязательно)">
          <FilePicker
            id="request-tz-file"
            file={tzFile}
            onChange={setTzFile}
            accept=".pdf,.doc,.docx"
            buttonLabel="Загрузить ТЗ"
          />
        </FormField>
      </Section>

      <Section title="Примечание для исполнителей">
        <FormField
          id="request-contractor-note"
          label="Краткое примечание (необязательно)"
          hint={`${contractorNote.length}/${CONTRACTOR_NOTE_MAX} — например «срочно, начать в течение 3 дней»`}
        >
          <Input
            value={contractorNote}
            onChange={(e) => setContractorNote(e.target.value.slice(0, CONTRACTOR_NOTE_MAX))}
            maxLength={CONTRACTOR_NOTE_MAX}
            placeholder="Оплата только наличными"
          />
        </FormField>
      </Section>

      <Section title="Объект">
        <SiteFields sites={sites} value={site} onChange={setSite} errors={shownSiteErrors} />
      </Section>

      <Button type="submit" disabled={isSubmitting} size="lg" style={{ alignSelf: "flex-start", paddingLeft: 32, paddingRight: 32 }}>
        {isSubmitting ? "Создание…" : "Создать заявку"}
      </Button>
    </form>
  );
}
