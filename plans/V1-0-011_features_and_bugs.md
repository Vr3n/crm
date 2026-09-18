# New Issues for sprint.

## 1: Custom Invoice & Payment Date.

Currently the Invoicing date is automatically issued to current date.
Sometimes we input old data or future invoice so I need to set invoice issuing date.

The date field should be in the order summary of the `membership sale form`, `Invoice form`, `Payment form`.

## 2: Invoice, Payment & Repayment PDFs.

Add terms and conditions in these receipts.
search the most used terms and conditions by the GYMs for particular pdfs.

## 3: Recorded By and Ownership.

Some modules have hardcoded `recorded by` instead of logged in staff member.
For .e.g When I record a invoice, It shows me recorded by Viren Patel instead of the logged in staff member.

## 4: Date Time Locality & International issues.

When we export excel the Date Time is in UTC instead of The local machine.

ADHOC: Add a renew membership button in the membership expiration.

# Big new Plans.

## The Google Drive, & Local Sync

I want to enable synching the Database of our application in Local Network and also with Google Drive.

1. If two of our apps are in same local network, it should be able to detect different DB and the user can select it at login screen.
2. Same as above for Google drive, If we detect a google drive access granted for the sync then show options to select which DB you want to access.

## Automatic Backups of Database.

1. There should be an automatic backups setup for the database. The automatic backup location should bydefault be the `Documents` directory.
2. We ask user for setting up backup directory during the installation. The user can also set it in the Organization settings.
3. If Google drive is integrated then we can setup backup to google drive too.
