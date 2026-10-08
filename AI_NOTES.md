# AI-Assisted Development Summary

## AI Tool Used

**Tool:** Claude Code

Claude Code was used as an AI-assisted development tool throughout the implementation and validation process. The tool supported code analysis, implementation, API and frontend changes, test creation, and debugging.

All generated changes were reviewed and validated as part of the development process.

---

## Issues Identified and Resolved

### 1. Redirection Status Checker

**Issue:**  
The redirection status checker was not handling all expected scenarios correctly.

**How it was identified:**  
I performed end-to-end (E2E) testing across the application to validate the complete user flow, including URL creation, expiration handling, and redirection behavior.

**Resolution:**  
The redirection status checker was reviewed and corrected to properly handle the expected URL states and HTTP responses.

---

### 2. Inactive/Expired Screen Redirect Bug

**Issue:**  
There was a bug affecting the redirection flow when a shortened URL was inactive or expired.

**How it was identified:**  
The issue was identified during end-to-end testing of the complete application. Testing the full user flow made it possible to reproduce the behavior and verify the expected result for inactive and expired links.

**Resolution:**  
The redirection flow and corresponding UI behavior were corrected so that inactive and expired URLs display the appropriate status and user-facing information.

---

## Key AI Prompt Used

The following prompt was particularly important because it defined a significant portion of the application's API and frontend requirements:

> Let's polish the POST endpoint. Be able to handle the request body with `url` and `expiresIn`, by default in 86400 milliseconds. It can be changed on the frontend side. Add the field in the frontend UI. The response will be the code with the full `shortUrl`.
>
> Also create a new endpoint `/api/links` to retrieve all URLs with the `code`, `shortUrl`, `expiresIn`, and `active` fields.
>
> Also validate the redirection endpoint with `404 Not Found`, `410 Gone` for inactive links, and `410 Gone` for expired links. Add proper descriptions in the UI if the redirect is not valid. If the redirection is valid, use status `302` since we don't have permanent caching.

### Scope of the Prompt

This prompt was significant because it addressed the application's functionality across both the **backend API and frontend interface**. It covered:

- Refinement of the URL creation `POST` endpoint.
- Support for configurable URL expiration.
- Addition of the expiration field to the frontend.
- Creation of the `/api/links` endpoint for retrieving existing shortened URLs.
- Definition of the required API response fields.
- Validation of invalid, inactive, and expired URLs.
- Appropriate HTTP status codes for each redirection scenario.
- User-facing descriptions for invalid redirections.
- Temporary (`302`) redirects for valid URLs to avoid permanent browser or intermediary caching.
- Frontend and backend integration.
- Validation through testing.

This approach allowed the requirements to be addressed as a cohesive full-stack implementation rather than as isolated frontend or backend changes.

---

## Testing and Validation

End-to-end testing was performed across the application to verify the implemented functionality and identify issues that were not immediately apparent from isolated component or API testing.

The testing process covered the main URL lifecycle, including:

1. Creating a shortened URL.
2. Configuring its expiration time.
3. Retrieving existing links.
4. Redirecting through a valid shortened URL.
5. Handling non-existent URLs (`404 Not Found`).
6. Handling inactive URLs (`410 Gone`).
7. Handling expired URLs (`410 Gone`).
8. Verifying the corresponding frontend messaging.
9. Confirming the expected API and frontend behavior after the changes.

The use of AI was therefore complemented by manual review and end-to-end validation to ensure that the resulting implementation met the expected functional requirements.