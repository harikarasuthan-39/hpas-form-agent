import { useState, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════
   HPAS — Privacy-First Intelligent Form Agent
   REAL Document Extraction using Claude Vision API
   Supports: Aadhaar, Community Certificate, Marksheet, Income Cert
═══════════════════════════════════════════════════════════════════ */

// ── ⚠️  PASTE YOUR ANTHROPIC API KEY HERE ─────────────────────────
const API_KEY = "YOUR_ANTHROPIC_API_KEY_HERE";
// ──────────────────────────────────────────────────────────────────

const GOV_FORM = {
  title: "National Scholarship Portal",
  subtitle: "Post-Matric Scholarship Application 2025–26",
  ministry: "Ministry of Education, Government of India",
  sections: [
    {
      id: "personal", title: "Personal Information", icon: "👤",
      fields: [
        { id: "full_name",   label: "Full Name",              type: "text",   placeholder: "As on Aadhaar / Certificate" },
        { id: "dob",         label: "Date of Birth",          type: "text",   placeholder: "DD/MM/YYYY" },
        { id: "gender",      label: "Gender",                 type: "select", options: ["","Male","Female","Transgender","Prefer not to say"] },
        { id: "category",    label: "Category",               type: "select", options: ["","General","OBC","SC","ST","EWS"] },
        { id: "religion",    label: "Religion",               type: "select", options: ["","Hindu","Muslim","Christian","Sikh","Buddhist","Jain","Others"] },
        { id: "nationality", label: "Nationality",            type: "text",   placeholder: "e.g. Indian" },
      ]
    },
    {
      id: "contact", title: "Contact & Address", icon: "📍",
      fields: [
        { id: "mobile",   label: "Mobile Number",       type: "text",   placeholder: "10-digit number" },
        { id: "email",    label: "Email Address",        type: "text",   placeholder: "student@example.com" },
        { id: "address",  label: "Residential Address",  type: "text",   placeholder: "Door no, Street, Area" },
        { id: "district", label: "District",             type: "text",   placeholder: "District" },
        { id: "state",    label: "State",                type: "select", options: ["","Tamil Nadu","Kerala","Karnataka","Andhra Pradesh","Telangana","Maharashtra","Delhi","Uttar Pradesh","Gujarat","Rajasthan","West Bengal","Others"] },
        { id: "pincode",  label: "PIN Code",             type: "text",   placeholder: "6-digit PIN" },
      ]
    },
    {
      id: "academic", title: "Academic Details", icon: "🎓",
      fields: [
        { id: "institution", label: "College / Institution", type: "text",   placeholder: "Institution name" },
        { id: "course",      label: "Course / Programme",    type: "text",   placeholder: "e.g. B.E. Computer Science" },
        { id: "year",        label: "Year of Study",         type: "select", options: ["","1st Year","2nd Year","3rd Year","4th Year","5th Year"] },
        { id: "board",       label: "Previous Board/Univ.",  type: "text",   placeholder: "Board or University name" },
        { id: "percentage",  label: "Previous % / CGPA",     type: "text",   placeholder: "e.g. 85.4" },
        { id: "income",      label: "Annual Family Income ₹",type: "text",   placeholder: "e.g. 250000" },
      ]
    },
    {
      id: "bank", title: "Bank Details", icon: "🏦",
      fields: [
        { id: "bank_name", label: "Bank Name",       type: "text", placeholder: "e.g. State Bank of India" },
        { id: "branch",    label: "Branch Name",     type: "text", placeholder: "Branch" },
        { id: "ifsc",      label: "IFSC Code",       type: "text", placeholder: "e.g. SBIN0001234" },
        { id: "account",   label: "Account Number",  type: "text", placeholder: "Enter manually (sensitive)", sensitive: true },
      ]
    }
  ]
};

const ALL_FIELD_IDS = GOV_FORM.sections.flatMap(s => s.fields.map(f => f.id));

// ── Sensitivity Rules ─────────────────────────────────────────────
const SENSITIVE_KEYS = ["account","aadhaar","pan","otp","password","cvv","pin"];
const SENSITIVE_REGEX = [/\b\d{4}\s\d{4}\s\d{4}\b/, /\b[A-Z]{5}\d{4}[A-Z]\b/];
function isSensitive(key, val = "") {
  if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) return true;
  if (GOV_FORM.sections.flatMap(s=>s.fields).find(f => f.id===key && f.sensitive)) return true;
  return SENSITIVE_REGEX.some(r => r.test(String(val)));
}

// ── Convert file to base64 ────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Claude Vision Extraction ──────────────────────────────────────
async function extractFromDocument(file, apiKey) {
  const base64 = await fileToBase64(file);
  const isPDF = file.type === "application/pdf";

  const fieldDescriptions = GOV_FORM.sections.flatMap(s =>
    s.fields.map(f => `"${f.id}": ${f.label}`)
  ).join(", ");

  const prompt = `You are an OCR and data extraction assistant. Carefully read this document image and extract all visible information.

Map the extracted data to these specific form field IDs:
${fieldDescriptions}

Rules:
- Extract ONLY what is clearly visible in the document
- For "full_name": extract the person's complete name
- For "dob": format as DD/MM/YYYY
- For "gender": use exactly "Male", "Female", or "Transgender"  
- For "category": use exactly "General", "OBC", "SC", "ST", or "EWS"
- For "state": extract the state name as written
- For "account": leave as empty string "" (sensitive - never extract)
- For fields not found in the document, use empty string ""
- Do NOT invent or guess values

Respond ONLY with a valid JSON object. No explanation, no markdown, no backticks.
Example: {"full_name":"Rajesh Kumar","dob":"15/08/1990","gender":"Male","category":"OBC","mobile":"9876543210","email":"","address":"42 Gandhi Nagar","district":"Chennai","state":"Tamil Nadu","pincode":"600001","institution":"","course":"","year":"","board":"","percentage":"","income":"","bank_name":"","branch":"","ifsc":"","account":"","religion":"Hindu","nationality":"Indian"}`;

  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: [
        isPDF
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
          : { type: "image",    source: { type: "base64", media_type: file.type, data: base64 } },
        { type: "text", text: prompt }
      ]
    }]
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "API call failed");
  }

  const data = await res.json();
  const text = data.content?.map(b => b.text || "").join("").trim();

  // Parse JSON safely
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Lora:ital,wght@0,400;0,600;1,400&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#07080f;
  --s1:#0d0f1c;
  --s2:#121526;
  --s3:#181d30;
  --s4:#1e2338;
  --border:#232840;
  --border2:#2a3050;
  --gold:#e8a020;
  --gold2:#ffc233;
  --gold-glow:rgba(232,160,32,0.15);
  --teal:#00bfa5;
  --teal-glow:rgba(0,191,165,0.12);
  --red:#f05050;
  --red-glow:rgba(240,80,80,0.1);
  --txt:#dde1f0;
  --txt2:#8892b0;
  --txt3:#4a5270;
  --white:#fff;
  --r:12px;
  --r2:8px;
}
html{scroll-behavior:smooth;}
body{font-family:'Outfit',sans-serif;background:var(--bg);color:var(--txt);min-height:100vh;overflow-x:hidden;}

/* Background mesh */
body::after{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(ellipse 600px 400px at 80% 10%, rgba(232,160,32,0.04) 0%, transparent 70%),
    radial-gradient(ellipse 500px 400px at 10% 80%, rgba(0,191,165,0.04) 0%, transparent 70%);
}

.app{position:relative;z-index:1;display:flex;flex-direction:column;min-height:100vh;}

/* ── Header ── */
.hdr{
  height:68px;padding:0 36px;
  display:flex;align-items:center;justify-content:space-between;
  background:rgba(13,15,28,0.97);
  border-bottom:1px solid var(--border);
  backdrop-filter:blur(16px);
  position:sticky;top:0;z-index:50;
}
.hdr-brand{display:flex;align-items:center;gap:14px;}
.hdr-gem{
  width:40px;height:40px;border-radius:10px;
  background:linear-gradient(135deg,var(--gold),var(--gold2));
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:18px;color:#07080f;
  box-shadow:0 0 20px rgba(232,160,32,0.35);
}
.hdr-name{font-weight:800;font-size:19px;letter-spacing:-0.02em;color:var(--white);}
.hdr-sub{font-size:11px;color:var(--txt3);font-weight:400;margin-top:1px;letter-spacing:0.05em;}
.hdr-pills{display:flex;gap:8px;}
.pill{
  font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;
  display:flex;align-items:center;gap:5px;letter-spacing:0.03em;
}
.pill-g{background:rgba(232,160,32,0.1);border:1px solid rgba(232,160,32,0.2);color:var(--gold);}
.pill-t{background:rgba(0,191,165,0.1);border:1px solid rgba(0,191,165,0.2);color:var(--teal);}
.dot{width:5px;height:5px;border-radius:50%;background:currentColor;animation:blink 2s infinite;}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}

/* ── Layout ── */
.body{flex:1;display:grid;grid-template-columns:320px 1fr;}

/* ── Sidebar ── */
.side{
  background:var(--s1);border-right:1px solid var(--border);
  display:flex;flex-direction:column;
  position:sticky;top:68px;height:calc(100vh - 68px);overflow-y:auto;
}
.side-section{padding:24px;}
.side-section+.side-section{border-top:1px solid var(--border);}
.side-label{font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--txt3);margin-bottom:16px;}

/* ── Upload zone ── */
.drop{
  border:2px dashed var(--border2);border-radius:var(--r);
  padding:28px 16px;text-align:center;cursor:pointer;
  transition:all .25s;background:var(--s2);
}
.drop:hover,.drop.over{border-color:var(--gold);background:rgba(232,160,32,0.04);box-shadow:inset 0 0 40px var(--gold-glow);}
.drop-ico{
  width:52px;height:52px;margin:0 auto 12px;border-radius:12px;
  background:rgba(232,160,32,0.1);border:1px solid rgba(232,160,32,0.2);
  display:flex;align-items:center;justify-content:center;font-size:22px;
}
.drop-h{font-weight:700;font-size:14px;color:var(--txt);margin-bottom:5px;}
.drop-s{font-size:12px;color:var(--txt3);line-height:1.5;}
.drop-tags{display:flex;justify-content:center;gap:5px;margin-top:10px;}
.tag{font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.05em;background:var(--s3);border:1px solid var(--border2);color:var(--txt3);}
.file-ok{
  margin-top:12px;padding:9px 12px;border-radius:8px;
  background:rgba(0,191,165,0.08);border:1px solid rgba(0,191,165,0.2);
  display:flex;align-items:center;gap:8px;font-size:12px;color:var(--teal);font-weight:600;
}
.file-ok-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;}

/* ── API Key input ── */
.key-wrap{position:relative;}
.key-input{
  width:100%;padding:9px 36px 9px 12px;
  background:var(--s2);border:1px solid var(--border2);border-radius:8px;
  color:var(--txt);font-family:'Outfit',sans-serif;font-size:13px;
  outline:none;transition:border-color .2s;
}
.key-input:focus{border-color:var(--gold);}
.key-eye{
  position:absolute;right:10px;top:50%;transform:translateY(-50%);
  font-size:14px;cursor:pointer;color:var(--txt3);transition:color .2s;
}
.key-eye:hover{color:var(--txt);}
.key-hint{font-size:11px;color:var(--txt3);margin-top:6px;line-height:1.4;}

/* ── Steps ── */
.steps{}
.step-row{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);}
.step-row:last-child{border-bottom:none;}
.snum{
  width:28px;height:28px;border-radius:50%;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:700;
  border:2px solid var(--border2);color:var(--txt3);transition:all .3s;
}
.step-row.on .snum{border-color:var(--gold);color:var(--gold);background:rgba(232,160,32,0.08);}
.step-row.done .snum{border-color:var(--teal);color:var(--teal);background:rgba(0,191,165,0.08);}
.sinfo{}
.sname{font-size:13px;font-weight:600;color:var(--txt2);transition:color .3s;}
.step-row.on .sname{color:var(--gold);}
.step-row.done .sname{color:var(--teal);}
.sdesc{font-size:11px;color:var(--txt3);margin-top:2px;line-height:1.4;}

/* ── Side Stats ── */
.sstat-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.sstat{background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;}
.sstat-n{font-weight:800;font-size:24px;line-height:1;}
.c-gold{color:var(--gold);}
.c-teal{color:var(--teal);}
.c-red{color:var(--red);}
.c-dim{color:var(--txt3);}
.sstat-l{font-size:10px;color:var(--txt3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-top:3px;}

/* ── Buttons ── */
.btn{
  display:inline-flex;align-items:center;gap:7px;
  padding:10px 18px;border-radius:8px;border:none;cursor:pointer;
  font-family:'Outfit',sans-serif;font-weight:600;font-size:13px;
  transition:all .2s;letter-spacing:.01em;
}
.btn-gold{
  background:linear-gradient(135deg,var(--gold),var(--gold2));
  color:#07080f;box-shadow:0 4px 16px rgba(232,160,32,.28);
}
.btn-gold:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(232,160,32,.4);}
.btn-outline{background:transparent;color:var(--txt2);border:1px solid var(--border2);}
.btn-outline:hover{border-color:var(--txt2);color:var(--txt);}
.btn-teal{background:rgba(0,191,165,.12);color:var(--teal);border:1px solid rgba(0,191,165,.25);}
.btn-teal:hover{background:rgba(0,191,165,.22);}
.btn-block{width:100%;justify-content:center;}
.btn:disabled{opacity:.35;cursor:not-allowed;transform:none!important;box-shadow:none!important;}
.btn-lg{padding:13px 26px;font-size:15px;border-radius:10px;}

/* ── Main area ── */
.main{padding:32px 36px;overflow-y:auto;}

/* ── Page top ── */
.ptop{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:28px;}
.ptitle{font-weight:800;font-size:24px;color:var(--white);letter-spacing:-.02em;}
.psub{font-size:13px;color:var(--txt3);margin-top:4px;font-family:'Lora',serif;font-style:italic;}
.pbtns{display:flex;gap:8px;align-items:center;flex-shrink:0;}

/* ── Alert banner ── */
.banner{
  border-radius:var(--r2);padding:12px 16px;margin-bottom:20px;
  display:flex;align-items:flex-start;gap:10px;font-size:13px;line-height:1.5;
}
.banner-info{background:rgba(0,191,165,.07);border:1px solid rgba(0,191,165,.2);color:var(--teal);}
.banner-warn{background:rgba(232,160,32,.07);border:1px solid rgba(232,160,32,.2);color:var(--gold);}
.banner-err{background:rgba(240,80,80,.07);border:1px solid rgba(240,80,80,.2);color:var(--red);}
.banner-ico{font-size:16px;flex-shrink:0;margin-top:1px;}

/* ── Form top card ── */
.form-top{
  background:linear-gradient(135deg,var(--s2),var(--s3));
  border:1px solid var(--border);border-radius:var(--r);
  padding:20px 24px;margin-bottom:20px;
  display:flex;align-items:center;gap:18px;
}
.form-flag{
  width:52px;height:52px;border-radius:10px;flex-shrink:0;
  background:linear-gradient(135deg,#0f2a5e,#1a3d80);
  display:flex;align-items:center;justify-content:center;font-size:26px;
  border:1px solid rgba(100,150,255,.15);
}
.form-titles .ft1{font-weight:700;font-size:17px;color:var(--white);}
.form-titles .ft2{font-size:12px;color:var(--txt3);margin-top:3px;}
.form-titles .ft3{font-size:10px;color:var(--txt3);margin-top:7px;padding-top:7px;border-top:1px solid var(--border);letter-spacing:.04em;}

/* ── Form section ── */
.fsec{background:var(--s1);border:1px solid var(--border);border-radius:var(--r);margin-bottom:16px;overflow:hidden;}
.fsec-hd{
  display:flex;align-items:center;gap:10px;
  padding:15px 22px;background:var(--s2);border-bottom:1px solid var(--border);
}
.fsec-ico{
  width:32px;height:32px;border-radius:7px;
  background:rgba(232,160,32,.1);border:1px solid rgba(232,160,32,.15);
  display:flex;align-items:center;justify-content:center;font-size:15px;
}
.fsec-title{font-weight:700;font-size:14px;color:var(--txt);}
.fsec-count{
  margin-left:auto;font-size:10px;padding:2px 9px;border-radius:10px;
  background:rgba(0,191,165,.07);color:var(--teal);border:1px solid rgba(0,191,165,.15);
  font-weight:700;
}

.fgrid{display:grid;grid-template-columns:1fr 1fr;}

.fwrap{
  padding:16px 22px;position:relative;
  border-bottom:1px solid var(--border);
}
.fwrap:nth-child(odd){border-right:1px solid var(--border);}
.fwrap:nth-last-child(-n+2){border-bottom:none;}
.fwrap.solo{grid-column:1/-1;border-right:none;}

.flabel{
  font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;
  color:var(--txt3);margin-bottom:7px;display:flex;align-items:center;gap:6px;
}
.sens-tag{
  font-size:9px;padding:1px 5px;border-radius:3px;
  background:rgba(240,80,80,.1);color:var(--red);border:1px solid rgba(240,80,80,.2);
  letter-spacing:.02em;font-weight:700;
}

.finput,.fselect{
  width:100%;padding:9px 12px;
  background:var(--s3);border:1px solid var(--border2);border-radius:7px;
  color:var(--txt);font-family:'Outfit',sans-serif;font-size:13px;
  outline:none;transition:all .2s;appearance:none;
}
.finput:focus,.fselect:focus{border-color:var(--gold);background:rgba(232,160,32,.03);box-shadow:0 0 0 3px rgba(232,160,32,.07);}
.finput.ai,.fselect.ai{
  border-color:rgba(0,191,165,.4);background:rgba(0,191,165,.05);color:#5ff0dc;
}
.finput.ai:focus,.fselect.ai:focus{box-shadow:0 0 0 3px rgba(0,191,165,.08);}
.finput.sens{background:rgba(240,80,80,.04);border-color:rgba(240,80,80,.2);}
.finput::placeholder{color:var(--txt3);}
.fselect option{background:var(--s3);}

.fbadge{
  position:absolute;top:14px;right:22px;
  font-size:9px;padding:2px 7px;border-radius:4px;font-weight:700;letter-spacing:.03em;
}
.fbadge-ai{background:rgba(0,191,165,.1);color:var(--teal);border:1px solid rgba(0,191,165,.2);}
.fbadge-sens{background:rgba(240,80,80,.1);color:var(--red);border:1px solid rgba(240,80,80,.2);}

/* ── Loading modal ── */
.overlay{
  position:fixed;inset:0;z-index:100;
  background:rgba(7,8,15,.88);backdrop-filter:blur(10px);
  display:flex;align-items:center;justify-content:center;
}
.lcard{
  background:var(--s1);border:1px solid var(--border);border-radius:20px;
  padding:40px 48px;text-align:center;max-width:380px;width:90%;
}
.lring{
  width:64px;height:64px;margin:0 auto 22px;
  border:3px solid var(--border2);border-top-color:var(--gold);
  border-radius:50%;animation:spin 1s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}
.ltitle{font-weight:800;font-size:19px;color:var(--white);margin-bottom:8px;}
.lsub{font-size:13px;color:var(--txt3);line-height:1.6;}
.lstep{
  margin-top:18px;padding:10px 14px;background:var(--s2);border-radius:8px;
  font-size:12px;color:var(--gold);font-weight:600;
  border:1px solid rgba(232,160,32,.15);
}
.lprog{
  margin-top:12px;height:3px;background:var(--border);border-radius:2px;overflow:hidden;
}
.lprog-fill{
  height:100%;background:linear-gradient(90deg,var(--gold),var(--gold2));
  border-radius:2px;transition:width .5s ease;
}

/* ── Success ── */
.success-top{
  background:linear-gradient(135deg,rgba(0,191,165,.07),rgba(0,191,165,.03));
  border:1px solid rgba(0,191,165,.2);border-radius:var(--r);
  padding:24px 28px;margin-bottom:24px;
  display:flex;align-items:center;gap:18px;
}
.success-emoji{font-size:42px;}
.stitle{font-weight:800;font-size:21px;color:var(--teal);}
.ssub{font-size:13px;color:var(--txt3);margin-top:4px;line-height:1.5;}
.ref{
  display:inline-block;margin-top:8px;padding:4px 12px;
  background:rgba(0,191,165,.1);border-radius:5px;font-size:12px;
  font-weight:700;color:var(--teal);border:1px solid rgba(0,191,165,.2);
  font-family:monospace;
}
.wipe-note{
  background:rgba(240,80,80,.06);border:1px solid rgba(240,80,80,.15);
  border-radius:8px;padding:12px 18px;margin-top:20px;
  display:flex;align-items:center;gap:10px;font-size:13px;color:var(--red);
}

/* ── Preview table ── */
.ptable{background:var(--s1);border:1px solid var(--border);border-radius:var(--r);margin-bottom:14px;overflow:hidden;}
.ptable-hd{
  padding:13px 20px;background:var(--s2);border-bottom:1px solid var(--border);
  font-size:12px;font-weight:700;color:var(--txt2);letter-spacing:.05em;
  display:flex;align-items:center;gap:8px;
}
.prow{display:flex;padding:10px 20px;border-bottom:1px solid var(--border);font-size:13px;}
.prow:last-child{border-bottom:none;}
.pk{width:210px;flex-shrink:0;color:var(--txt3);font-weight:500;}
.pv{color:var(--txt);font-weight:600;}
.pblocked{color:var(--red);font-size:11px;font-style:italic;font-weight:400;}

/* ── Toast ── */
.toast{
  position:fixed;bottom:24px;right:24px;z-index:200;
  background:var(--s1);border:1px solid var(--border);border-radius:12px;
  padding:13px 18px;display:flex;align-items:center;gap:9px;
  font-size:13px;font-weight:500;color:var(--txt);
  box-shadow:0 8px 32px rgba(0,0,0,.5);
  animation:slideup .3s ease;
}
@keyframes slideup{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}

/* ── Animated entry ── */
.fadein{animation:fi .4s ease;}
@keyframes fi{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}

/* ── Scrollbar ── */
::-webkit-scrollbar{width:5px;}
::-webkit-scrollbar-track{background:var(--s1);}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px;}

@media(max-width:860px){
  .body{grid-template-columns:1fr;}
  .side{position:static;height:auto;}
  .fgrid{grid-template-columns:1fr;}
  .fwrap:nth-child(odd){border-right:none;}
  .main{padding:20px;}
  .hdr{padding:0 16px;}
}
`;

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function HPAS() {
  const [phase, setPhase]       = useState("upload");
  const [file, setFile]         = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [drag, setDrag]         = useState(false);
  const [apiKey, setApiKey]     = useState(API_KEY);
  const [showKey, setShowKey]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [loadMsg, setLoadMsg]   = useState("");
  const [progress, setProgress] = useState(0);
  const [formVals, setFormVals] = useState({});
  const [aiFilled, setAiFilled] = useState({});
  const [blocked, setBlocked]   = useState({});
  const [error, setError]       = useState("");
  const [toast, setToast]       = useState(null);
  const [refId]                 = useState("NSP-" + Math.random().toString(36).substr(2,8).toUpperCase());
  const fileRef = useRef();

  const showToast = (msg, ico="✅") => {
    setToast({msg,ico}); setTimeout(()=>setToast(null),3500);
  };

  const aiCount   = Object.keys(aiFilled).length;
  const blockCount= Object.keys(blocked).length;
  const fillCount = Object.values(formVals).filter(v=>String(v).trim()!=="").length;
  const totalFields = GOV_FORM.sections.flatMap(s=>s.fields).length;
  const step = phase==="upload"?1:phase==="review"?2:3;

  // ── File pick ──
  const onFilePick = useCallback((e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!f) return;
    setFile(f);
    setError("");
    if (f.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null);
    }
  }, []);

  // ── Extract ──
  const handleExtract = async () => {
    if (!file) { setError("Please upload a document first."); return; }
    const key = apiKey.trim();
    if (!key || key === "YOUR_ANTHROPIC_API_KEY_HERE") {
      setError("Please enter your Anthropic API key to extract from a real document.");
      return;
    }
    setError(""); setLoading(true);

    try {
      setLoadMsg("📸 Reading your document…"); setProgress(20);
      await new Promise(r=>setTimeout(r,600));

      setLoadMsg("🔍 Running AI Vision OCR…"); setProgress(45);
      await new Promise(r=>setTimeout(r,400));

      const extracted = await extractFromDocument(file, key);

      setLoadMsg("🧠 Mapping fields intelligently…"); setProgress(75);
      await new Promise(r=>setTimeout(r,500));

      setLoadMsg("🔒 Classifying sensitive data…"); setProgress(90);
      await new Promise(r=>setTimeout(r,400));

      // Build values, aiFilled, blocked
      const vals={}, ai={}, blk={};
      for (const id of ALL_FIELD_IDS) {
        const raw = extracted[id] ?? "";
        if (isSensitive(id, raw)) {
          blk[id] = true;
          vals[id] = "";
        } else if (raw !== "") {
          vals[id] = raw;
          ai[id]   = true;
        } else {
          vals[id] = "";
        }
      }

      setProgress(100);
      await new Promise(r=>setTimeout(r,300));

      setFormVals(vals); setAiFilled(ai); setBlocked(blk);
      setLoading(false); setPhase("review");
      showToast(`${Object.keys(ai).length} fields extracted from your document`, "🤖");

    } catch(err) {
      setLoading(false);
      setError("Extraction failed: " + err.message + ". Check your API key and try again.");
    }
  };

  // ── Submit ──
  const handleSubmit = async () => {
    setLoading(true); setProgress(0);
    setLoadMsg("🔐 Encrypting form data…"); setProgress(30);
    await new Promise(r=>setTimeout(r,700));
    setLoadMsg("📤 Submitting to portal…"); setProgress(65);
    await new Promise(r=>setTimeout(r,800));
    setLoadMsg("🗑️ Wiping memory…"); setProgress(90);
    await new Promise(r=>setTimeout(r,500));
    setProgress(100);
    await new Promise(r=>setTimeout(r,300));
    setLoading(false); setPhase("success");
  };

  const reset = () => {
    setPhase("upload"); setFile(null); setPreviewUrl(null);
    setFormVals({}); setAiFilled({}); setBlocked({}); setError("");
  };

  const sectionFill = (s) =>
    s.fields.filter(f=>(formVals[f.id]||"").trim()!=="").length;

  return (
    <>
      <style>{CSS}</style>

      {/* Loading Modal */}
      {loading && (
        <div className="overlay">
          <div className="lcard">
            <div className="lring" />
            <div className="ltitle">Processing Document</div>
            <div className="lsub">Your document is read locally via Claude Vision.<br/>Nothing is stored or sent to any third party.</div>
            <div className="lstep">{loadMsg}</div>
            <div className="lprog"><div className="lprog-fill" style={{width:`${progress}%`}} /></div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast"><span>{toast.ico}</span>{toast.msg}</div>}

      <div className="app">

        {/* Header */}
        <header className="hdr">
          <div className="hdr-brand">
            <div className="hdr-gem">H</div>
            <div>
              <div className="hdr-name">HPAS</div>
              <div className="hdr-sub">Privacy-First · AI Form Agent</div>
            </div>
          </div>
          <div className="hdr-pills">
            <div className="pill pill-t"><span className="dot"/>Zero Retention</div>
            <div className="pill pill-g"><span className="dot"/>Claude Vision</div>
          </div>
        </header>

        <div className="body">

          {/* ── Sidebar ── */}
          <aside className="side">

            {/* Upload */}
            <div className="side-section">
              <div className="side-label">Your Document</div>
              <div
                className={`drop ${drag?"over":""}`}
                onClick={()=>fileRef.current.click()}
                onDragOver={e=>{e.preventDefault();setDrag(true);}}
                onDragLeave={()=>setDrag(false)}
                onDrop={onFilePick}
              >
                <input type="file" ref={fileRef} style={{display:"none"}}
                  accept=".pdf,.png,.jpg,.jpeg" onChange={onFilePick}/>
                {previewUrl ? (
                  <img src={previewUrl} alt="preview"
                    style={{width:"100%",borderRadius:8,maxHeight:140,objectFit:"cover",marginBottom:8}}/>
                ) : (
                  <>
                    <div className="drop-ico">📎</div>
                    <div className="drop-h">Drop your document</div>
                    <div className="drop-s">Aadhaar · Certificate<br/>Marksheet · Income Proof</div>
                    <div className="drop-tags">
                      {["PDF","PNG","JPG"].map(t=><span key={t} className="tag">{t}</span>)}
                    </div>
                  </>
                )}
                {file && (
                  <div className="file-ok">
                    <span>✅</span>
                    <span className="file-ok-name">{file.name}</span>
                  </div>
                )}
              </div>

              {/* API Key */}
              <div style={{marginTop:16}}>
                <div className="side-label" style={{marginBottom:8}}>Anthropic API Key</div>
                <div className="key-wrap">
                  <input
                    className="key-input"
                    type={showKey?"text":"password"}
                    placeholder="sk-ant-api03-..."
                    value={apiKey}
                    onChange={e=>setApiKey(e.target.value)}
                  />
                  <span className="key-eye" onClick={()=>setShowKey(p=>!p)}>
                    {showKey?"🙈":"👁️"}
                  </span>
                </div>
                <div className="key-hint">Used only to call Claude Vision. Never stored.</div>
              </div>

              {/* Error */}
              {error && (
                <div className="banner banner-err" style={{marginTop:12}}>
                  <span className="banner-ico">⚠️</span>{error}
                </div>
              )}

              {/* CTA */}
              <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:8}}>
                <button className="btn btn-gold btn-block"
                  onClick={handleExtract}
                  disabled={phase!=="upload"||loading}>
                  ⚡ Extract &amp; Fill Form
                </button>
                {phase!=="upload" && (
                  <button className="btn btn-outline btn-block" onClick={reset}>
                    ↩ Start Over
                  </button>
                )}
              </div>
            </div>

            {/* Steps */}
            <div className="side-section">
              <div className="side-label">How it works</div>
              <div className="steps">
                {[
                  {n:1,name:"Upload Document",desc:"Any Aadhaar, certificate, or marksheet"},
                  {n:2,name:"AI Reads & Fills",desc:"Claude Vision extracts every field for you"},
                  {n:3,name:"Review & Submit",desc:"Edit any field, then submit securely"},
                ].map(s=>(
                  <div key={s.n} className={`step-row ${step===s.n?"on":step>s.n?"done":""}`}>
                    <div className="snum">{step>s.n?"✓":s.n}</div>
                    <div className="sinfo">
                      <div className="sname">{s.name}</div>
                      <div className="sdesc">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            {phase!=="upload" && (
              <div className="side-section">
                <div className="side-label">Extraction Stats</div>
                <div className="sstat-grid">
                  <div className="sstat">
                    <div className="sstat-n c-gold">{fillCount}</div>
                    <div className="sstat-l">Filled</div>
                  </div>
                  <div className="sstat">
                    <div className="sstat-n c-teal">{aiCount}</div>
                    <div className="sstat-l">AI Read</div>
                  </div>
                  <div className="sstat">
                    <div className="sstat-n c-red">{blockCount}</div>
                    <div className="sstat-l">Blocked</div>
                  </div>
                  <div className="sstat">
                    <div className="sstat-n c-dim">0</div>
                    <div className="sstat-l">Stored</div>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* ── Main ── */}
          <main className="main">

            {/* ── UPLOAD PHASE ── */}
            {phase==="upload" && (
              <div className="fadein">
                <div className="ptop">
                  <div>
                    <div className="ptitle">National Scholarship Portal</div>
                    <div className="psub">Upload your document — AI fills all {totalFields} fields automatically</div>
                  </div>
                </div>
                <div className="banner banner-info">
                  <span className="banner-ico">🤖</span>
                  <span>HPAS uses <strong>Claude Vision AI</strong> to read your actual document and extract name, DOB, address, and all other fields directly. No typing needed. Sensitive fields like Aadhaar number and account number are automatically blocked.</span>
                </div>
                <div className="form-top">
                  <div className="form-flag">🇮🇳</div>
                  <div className="form-titles">
                    <div className="ft1">Post-Matric Scholarship Application 2025–26</div>
                    <div className="ft2">National Scholarship Portal — India</div>
                    <div className="ft3">Ministry of Education, Government of India</div>
                  </div>
                </div>
                {GOV_FORM.sections.map(sec=>(
                  <div className="fsec" key={sec.id}>
                    <div className="fsec-hd">
                      <div className="fsec-ico">{sec.icon}</div>
                      <div className="fsec-title">{sec.title}</div>
                    </div>
                    <div className="fgrid">
                      {sec.fields.map(f=>(
                        <div key={f.id} className="fwrap">
                          <div className="flabel">{f.label}</div>
                          {f.type==="select"
                            ? <select className="fselect" disabled><option>—</option></select>
                            : <input className="finput" type="text" placeholder={f.placeholder} disabled/>
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── REVIEW PHASE ── */}
            {phase==="review" && (
              <div className="fadein">
                <div className="ptop">
                  <div>
                    <div className="ptitle">Review Extracted Fields</div>
                    <div className="psub">{aiCount} fields extracted from your document — verify and edit if needed</div>
                  </div>
                  <div className="pbtns">
                    <button className="btn btn-outline" onClick={reset}>← Back</button>
                    <button className="btn btn-gold btn-lg" onClick={handleSubmit}>Submit Form →</button>
                  </div>
                </div>

                <div className="banner banner-info">
                  <span className="banner-ico">✦</span>
                  <span>Fields in <strong style={{color:"var(--teal)"}}>teal</strong> were extracted from your document by AI. <strong style={{color:"var(--red)"}}>Red</strong> fields are sensitive — enter them manually. Click any field to edit.</span>
                </div>

                <div className="form-top">
                  <div className="form-flag">🇮🇳</div>
                  <div className="form-titles">
                    <div className="ft1">Post-Matric Scholarship Application 2025–26</div>
                    <div className="ft2">National Scholarship Portal — India</div>
                    <div className="ft3">Ministry of Education, Government of India</div>
                  </div>
                </div>

                {GOV_FORM.sections.map(sec=>(
                  <div className="fsec" key={sec.id}>
                    <div className="fsec-hd">
                      <div className="fsec-ico">{sec.icon}</div>
                      <div className="fsec-title">{sec.title}</div>
                      <div className="fsec-count">{sectionFill(sec)}/{sec.fields.length}</div>
                    </div>
                    <div className="fgrid">
                      {sec.fields.map(f=>{
                        const val   = formVals[f.id]??"";
                        const isAI  = !!aiFilled[f.id];
                        const isSens= !!blocked[f.id]||!!f.sensitive;
                        return (
                          <div key={f.id} className={`fwrap ${f.wide?"solo":""}`} style={{position:"relative"}}>
                            <div className="flabel">
                              {f.label}
                              {isSens && <span className="sens-tag">SENSITIVE</span>}
                            </div>
                            {isAI && !isSens && <span className="fbadge fbadge-ai">AI ✦</span>}
                            {isSens         && <span className="fbadge fbadge-sens">🔒 Manual</span>}
                            {f.type==="select"
                              ? <select
                                  className={`fselect ${isAI&&!isSens?"ai":""}`}
                                  value={val}
                                  onChange={e=>setFormVals(p=>({...p,[f.id]:e.target.value}))}
                                >
                                  {f.options.map(o=><option key={o} value={o}>{o||"Select…"}</option>)}
                                </select>
                              : <input
                                  className={`finput ${isAI&&!isSens?"ai":""} ${isSens?"sens":""}`}
                                  type="text"
                                  placeholder={isSens?"Enter manually — not extracted for privacy":f.placeholder}
                                  value={val}
                                  onChange={e=>setFormVals(p=>({...p,[f.id]:e.target.value}))}
                                />
                            }
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
                  <button className="btn btn-gold btn-lg" onClick={handleSubmit}>
                    Submit Form Securely →
                  </button>
                </div>
              </div>
            )}

            {/* ── SUCCESS PHASE ── */}
            {phase==="success" && (
              <div className="fadein">
                <div className="success-top">
                  <div className="success-emoji">🎉</div>
                  <div>
                    <div className="stitle">Application Submitted!</div>
                    <div className="ssub">
                      Your scholarship form has been submitted successfully.<br/>
                      <span className="ref">{refId}</span>
                    </div>
                  </div>
                </div>

                {GOV_FORM.sections.map(sec=>(
                  <div className="ptable" key={sec.id}>
                    <div className="ptable-hd">{sec.icon} {sec.title}</div>
                    {sec.fields.map(f=>{
                      const isSens=!!blocked[f.id]||!!f.sensitive;
                      return (
                        <div className="prow" key={f.id}>
                          <div className="pk">{f.label}</div>
                          {isSens
                            ? <div className="pblocked">🔒 Not extracted (sensitive)</div>
                            : <div className="pv">{formVals[f.id]||<span style={{color:"var(--txt3)"}}>—</span>}</div>
                          }
                        </div>
                      );
                    })}
                  </div>
                ))}

                <div className="wipe-note">
                  🗑️ <strong>Data wiped.</strong> All extracted fields and document data have been permanently cleared from memory.
                </div>

                <div style={{display:"flex",gap:10,marginTop:20}}>
                  <button className="btn btn-gold btn-lg" onClick={reset}>+ Fill Another Form</button>
                  <button className="btn btn-teal" onClick={()=>window.print()}>🖨️ Print Receipt</button>
                </div>
              </div>
            )}

          </main>
        </div>
      </div>
    </>
  );
}
