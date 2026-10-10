# Chat Build 27

Upload this package over the existing repository and redeploy with your existing commands and bindings. Refresh open chat tabs after deployment.

- Joining, leaving and timing out no longer create chat posts or alerts.
- Previous join/leave notices are hidden from the chat feed.
- Online/offline status remains in the participant list.
- New-message notifications and bonks are unchanged.
- Presence no longer writes event rows or reads event history, reducing database usage further.

No SQL, binding changes or database replacement is needed.
