// caldump — read selected macOS calendars via EventKit and emit JSON.
//
// Why EventKit (not AppleScript): Calendar.app's AppleScript `whose start date`
// predicate enumerates every event with per-event Apple Events overhead and
// HANGS on calendars with recurring/subscribed events. EventKit uses an indexed
// predicate (predicateForEvents) — fast and reliable, no hang.
//
// TCC: this binary embeds an Info.plist with NSCalendarsFullAccessUsageDescription
// so macOS shows a proper permission prompt and the grant sticks to this binary's
// identity. Read-only: never writes/edits/deletes events.
//
// Usage: caldump [days]   (default 30). Prints JSON array to stdout.
//        Exit 2 = access denied.

import EventKit
import Foundation

let days = CommandLine.arguments.count > 1 ? (Int(CommandLine.arguments[1]) ?? 30) : 30
let wanted = ["HARRY 🤓", "ANNY 🥸"]

let store = EKEventStore()
let sema = DispatchSemaphore(value: 0)
var granted = false
if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { ok, _ in granted = ok; sema.signal() }
} else {
    store.requestAccess(to: .event) { ok, _ in granted = ok; sema.signal() }
}
sema.wait()
guard granted else {
    FileHandle.standardError.write("calendar access denied\n".data(using: .utf8)!)
    exit(2)
}

let cals = store.calendars(for: .event).filter { wanted.contains($0.title) }
let now = Date()
let end = Calendar.current.date(byAdding: .day, value: days, to: now) ?? now.addingTimeInterval(Double(days) * 86400)
let pred = store.predicateForEvents(withStart: now, end: end, calendars: cals.isEmpty ? nil : cals)
let evs = store.events(matching: pred).sorted { $0.startDate < $1.startDate }

var out: [[String: Any]] = []
for e in evs {
    out.append([
        "calendar": e.calendar.title,
        "title": e.title ?? "(untitled)",
        "start_ts": Int(e.startDate.timeIntervalSince1970 * 1000),
        "end_ts": Int(e.endDate.timeIntervalSince1970 * 1000),
        "all_day": e.isAllDay,
        "location": (e.location?.isEmpty == false) ? e.location! : NSNull(),
    ])
}
let data = try JSONSerialization.data(withJSONObject: out, options: [])
FileHandle.standardOutput.write(data)
