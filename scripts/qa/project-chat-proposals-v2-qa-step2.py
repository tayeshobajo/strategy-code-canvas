"""Step 2 QA: transitions + submit + convert + nav-link recheck.

Runs after step-1 driver. Uses the freshly-generated draft proposals in
Jotaye's most-recent thread (dbb7b8ce...) for save/dismiss/submit, and
picks the older thread (6f34c3fb...) for convert-to-task since only that
thread contains a suggested_task draft (9406a6d9).
"""
import asyncio, json, os, time
from pathlib import Path
from playwright.async_api import async_playwright

OUT   = Path("/mnt/documents/qa/project-chat/proposals-v2-full")
SHOTS = OUT / "screenshots"
RAW   = OUT / "raw"

EMAIL       = "qa-operator@trust-tai.com"
PASSWORD    = os.environ["QA_SEED_PASSWORD"]
SUPA_URL    = "https://jqehcikzvyewijjvpszh.supabase.co"
SUPA_KEY    = "sb_publishable_mF24_o-spzzxHlB3i3jDkA_8euIpH9o"
STORAGE_KEY = "sb-jqehcikzvyewijjvpszh-auth-token"
JOTAYE      = "bbbbbbb1-0000-4000-8000-000000000002"

# Titles to target in the newest thread (dbb7b8ce)
TITLE_SAVE    = "Clarify Revenue Attribution and Point B Goals"       # client_clarification
TITLE_DISMISS = "Strategy Sprint Readiness Audit"                     # qa_checklist
TITLE_SUBMIT  = "Approve Strategy Sprint Roadmap"                     # review_item
# Titles to target in the older thread (6f34c3fb)
TITLE_CONVERT = "Blueprint expansion surface"                         # suggested_task
TITLE_INVALID = "Strategy Sprint Foundation & Revenue Blueprint QA"   # qa_checklist saved → try Save again

async def sign_in(page):
    return await page.evaluate(
        """async ({url, key, email, password, storageKey}) => {
            const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
                method:'POST', headers:{'apikey':key,'Content-Type':'application/json'},
                body: JSON.stringify({email,password})});
            const j = await r.json();
            if (!r.ok) return {error:j};
            const session={access_token:j.access_token,refresh_token:j.refresh_token,
              expires_at:Math.floor(Date.now()/1000)+(j.expires_in??3600),
              expires_in:j.expires_in,token_type:j.token_type,user:j.user};
            localStorage.setItem(storageKey, JSON.stringify(session));
            return {ok:true};
        }""",
        {"url":SUPA_URL,"key":SUPA_KEY,"email":EMAIL,"password":PASSWORD,"storageKey":STORAGE_KEY})


async def wait_for_cards(page, min_count=1, timeout_ms=15000):
    start = time.time()
    while (time.time() - start) * 1000 < timeout_ms:
        n = await page.evaluate("() => document.querySelectorAll('[data-qa-role=\"chat-proposal\"]').length")
        if n >= min_count:
            return n
        await page.wait_for_timeout(400)
    return 0


async def click_button_by_title(page, title, label):
    return await page.evaluate(
        """async ({title, label}) => {
            const cards = Array.from(document.querySelectorAll('[data-qa-role="chat-proposal"]'));
            const card = cards.find(c => (c.innerText||'').includes(title));
            if (!card) return {found:false, cards:cards.length, titles:cards.map(c=>(c.innerText||'').slice(0,60))};
            card.scrollIntoView({block:'center'});
            const btn = Array.from(card.querySelectorAll('button')).find(b => (b.textContent||'').trim().toLowerCase().includes(label.toLowerCase()));
            if (!btn) return {found:false, reason:'button', title, buttons:Array.from(card.querySelectorAll('button')).map(b=>b.textContent.trim())};
            const beforeStatus = card.getAttribute('data-qa-proposal-status');
            btn.click();
            return {found:true, title, label, beforeStatus};
        }""", {"title":title,"label":label})


async def status_of(page, title):
    return await page.evaluate(
        """(title) => {
            const cards = Array.from(document.querySelectorAll('[data-qa-role="chat-proposal"]'));
            const card = cards.find(c => (c.innerText||'').includes(title));
            return card ? card.getAttribute('data-qa-proposal-status') : null;
        }""", title)


async def select_thread(page, thread_id):
    return await page.evaluate(
        """(threadId) => {
            const btns = Array.from(document.querySelectorAll('button'));
            const t = btns.find(b => (b.getAttribute('data-qa-thread-id')||'')===threadId
                                   || (b.textContent||'').includes(threadId.slice(0,8)));
            if (t) { t.click(); return true; }
            return false;
        }""", thread_id)


async def rest(page, path, method="GET", body=None):
    return await page.evaluate(
        """async ({url,key,storageKey,path,method,body}) => {
            const s = JSON.parse(localStorage.getItem(storageKey)||'null');
            const h = {apikey:key,Authorization:`Bearer ${s?.access_token}`};
            if (body) h['Content-Type']='application/json';
            const r = await fetch(`${url}${path}`, {method, headers:h, body: body?JSON.stringify(body):undefined});
            const t = await r.text();
            let j=null; try { j=JSON.parse(t); } catch { j=t.slice(0,300); }
            return {status:r.status, body:j};
        }""",
        {"url":SUPA_URL,"key":SUPA_KEY,"storageKey":STORAGE_KEY,"path":path,"method":method,"body":body})


async def main():
    out = {"started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width":1440,"height":1200})
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print("[pageerror]", e))

        await page.goto("http://localhost:8080", wait_until="domcontentloaded")
        await sign_in(page)

        # --- Nav-link recheck: navigate overview and query workspace nav ---
        await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE}/overview",
                        wait_until="domcontentloaded")
        await page.wait_for_selector('[data-qa-nav="chat"]', timeout=15000)
        nav_href = await page.get_attribute('[data-qa-nav="chat"]', "href")
        await page.screenshot(path=str(SHOTS/"10_nav_link.png"))
        out["nav_link"] = {"hasChatLink": True, "href": nav_href}

        # --- Load Jotaye chat (latest thread auto-selected) ---
        await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE}/chat",
                        wait_until="domcontentloaded")
        await page.wait_for_selector('[data-qa-role="chat-composer"]', timeout=15000)
        n = await wait_for_cards(page, min_count=1, timeout_ms=20000)
        out["cards_in_latest_thread"] = n
        await page.screenshot(path=str(SHOTS/"03_latest_thread_hydrated.png"))

        # --- 4a. draft -> saved ---
        r_save = await click_button_by_title(page, TITLE_SAVE, "Save")
        await page.wait_for_timeout(2500)
        s_save_after = await status_of(page, TITLE_SAVE)
        out["4a_save"] = {"click": r_save, "status_after": s_save_after}

        # --- 4b. draft -> dismissed ---
        r_dismiss = await click_button_by_title(page, TITLE_DISMISS, "Dismiss")
        await page.wait_for_timeout(2500)
        s_dismiss_after = await status_of(page, TITLE_DISMISS)
        out["4b_dismiss"] = {"click": r_dismiss, "status_after": s_dismiss_after}

        # --- 5. submit-to-review ---
        rev_before = await rest(page, f"/rest/v1/engine_review_items?project_id=eq.{JOTAYE}&select=id,status,source,title,requested_by&order=created_at.desc")
        r_submit = await click_button_by_title(page, TITLE_SUBMIT, "Submit to Review")
        await page.wait_for_timeout(3500)
        s_submit_after = await status_of(page, TITLE_SUBMIT)
        rev_after = await rest(page, f"/rest/v1/engine_review_items?project_id=eq.{JOTAYE}&select=id,status,source,title,requested_by&order=created_at.desc")
        out["5_submit"] = {"click": r_submit, "status_after": s_submit_after,
                            "review_before": rev_before, "review_after": rev_after}
        await page.screenshot(path=str(SHOTS/"05_after_submit.png"))

        # --- Try invalid transition via server-fn: click Save again on dismissed card ---
        # (The dismissed card renders no button bar per ProposalCard isTerminal guard.)
        buttons_on_dismissed = await page.evaluate(
            """(title) => {
                const cards = Array.from(document.querySelectorAll('[data-qa-role="chat-proposal"]'));
                const card = cards.find(c => (c.innerText||'').includes(title));
                if (!card) return {found:false};
                return {found:true, status:card.getAttribute('data-qa-proposal-status'),
                        buttons:Array.from(card.querySelectorAll('button')).map(b=>b.textContent.trim())};
            }""", TITLE_DISMISS)
        out["4c_ui_terminal_state"] = buttons_on_dismissed

        # --- Switch to older thread for convert-to-task ---
        # Older thread has "Blueprint expansion surface" suggested_task
        # Try clicking a sidebar thread by matching title / creation date.
        # ThreadList renders <button> with the thread title. Older thread title is "New conversation".
        older_click = await page.evaluate(
            """() => {
                // Click the second "New conversation" thread in sidebar.
                const btns = Array.from(document.querySelectorAll('aside button, [data-qa-role="thread-list"] button, nav button'));
                let count=0;
                for (const b of Array.from(document.querySelectorAll('button'))) {
                    if ((b.textContent||'').trim().startsWith('New conversation')) {
                        count++;
                        if (count===2) { b.click(); return {clicked:true, index:count}; }
                    }
                }
                return {clicked:false, seen:count};
            }""")
        await page.wait_for_timeout(2500)
        n2 = await wait_for_cards(page, min_count=1, timeout_ms=15000)
        out["thread_switch"] = {"click": older_click, "cards": n2}
        await page.screenshot(path=str(SHOTS/"06_older_thread.png"))

        # --- 6. convert-to-task (button label contains "Suggested Task") ---
        tasks_before = await rest(page, f"/rest/v1/engine_tasks?project_id=eq.{JOTAYE}&select=id,status,name,source,ai_generated,created_by&order=created_at.desc")
        r_convert = await click_button_by_title(page, TITLE_CONVERT, "Suggested Task")
        await page.wait_for_timeout(3500)
        s_convert_after = await status_of(page, TITLE_CONVERT)
        tasks_after = await rest(page, f"/rest/v1/engine_tasks?project_id=eq.{JOTAYE}&select=id,status,name,source,ai_generated,created_by,acceptance_criteria&order=created_at.desc")
        out["6_convert"] = {"click": r_convert, "status_after": s_convert_after,
                            "tasks_before_count": len(tasks_before.get("body") or []) if isinstance(tasks_before.get("body"), list) else "err",
                            "tasks_after": tasks_after}
        await page.screenshot(path=str(SHOTS/"06_after_convert.png"))

        # --- Section 3: multi-viewport screenshots ---
        await page.set_viewport_size({"width":390,"height":844})
        await page.wait_for_timeout(500); await page.screenshot(path=str(SHOTS/"03_mobile_final.png"))
        await page.set_viewport_size({"width":834,"height":1194})
        await page.wait_for_timeout(500); await page.screenshot(path=str(SHOTS/"03_tablet_final.png"))
        await page.set_viewport_size({"width":1440,"height":1200})

        (RAW/"step2.json").write_text(json.dumps(out, indent=2, default=str))
        print("done")
        await browser.close()


asyncio.run(main())
