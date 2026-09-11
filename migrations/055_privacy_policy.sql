-- ============================================================
-- MIGRATION 055: Privacy Policy CMS
-- Public: GET /api/common/privacy-policy
-- Admin: /api/admin/privacy-policy
-- ============================================================

CREATE TABLE IF NOT EXISTS public.privacy_policy (
    id             SERIAL PRIMARY KEY,
    title          VARCHAR(150) NOT NULL,
    subtitle       VARCHAR(500),
    last_modified  VARCHAR(50),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.privacy_policy_sections (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    body         TEXT NOT NULL,
    sequence     INTEGER NOT NULL DEFAULT 1,
    status       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_privacy_policy_sections_sequence
    ON public.privacy_policy_sections (sequence ASC, id ASC);

INSERT INTO public.privacy_policy (title, subtitle, last_modified)
SELECT
    'Privacy Policy',
    'How MetroGini collects, uses, stores, and protects your Personal Data on the Platform.',
    'July 15, 2026'
WHERE NOT EXISTS (SELECT 1 FROM public.privacy_policy);

INSERT INTO public.privacy_policy_sections (title, body, status, sequence)
SELECT v.title, v.body, true, v.sequence
FROM (
    VALUES
        (
            '01 Introduction',
            $b$The website: https://www.metrogini.com ("Website") together with the mobile application ("App") and the dashboard by the same name ("Dashboard") (Website, App, Web Browser, MetroGini Whatsapp Ai booking bot and Dashboard are collectively referred to as the "Platform") is owned or operated, and managed by us i.e., MetroGini Private Limited, a company incorporated in India under the Companies Act, 2013, and having its registered office at A 103, Cascade, Vasant Oscar, Lbs marg, Mulund west, Mumbai 400080 ("MetroGini").

This Policy (as defined below) is applicable to all users who access or use the Platform, including customers who avail Services through the Platform and service providers who offer services through the Platform (collectively, "Users"). For purposes of this Policy, "you" and "your" means you as a User of the Platform, "we", "us" or "our" refer to MetroGini or its subsidiaries, parent or group entities, or affiliates as deemed so by MetroGini.

If you continue to browse and use this Platform or avail the Services you are agreeing to comply with and be bound by this privacy policy ("Policy"), which together with our terms of use (collectively, "Platform Policies") govern MetroGini's relationship with you in relation to the usage of this Platform.

Capitalized terms used but not defined herein shall have the same meaning ascribed to them in the terms of use or such other Platform Policies (as updated regularly).$b$,
            1
        ),
        (
            '02 Scope',
            $b$This Policy provides how we handle the Personal Data (as defined below) collected from you while you are accessing or using the Platform or availing the Services. It is advisable that you read this Policy carefully, because if and whenever you use our Platform or avail the Services, your Personal Data will be processed in accordance with this Policy. By using or accessing the Platform or availing the Services, you agree to be bound by the terms of this Policy. You should not use the Platform or avail the Services if you do not agree with this Policy, the other Platform Policies, or any other agreement that governs your use of the Platform or the Services.

This Policy is limited only to Personal Data that MetroGini collects from its Users who use or access the Platform or avails the Services. This Policy is governed by the Information Technology Act, 2000 read with the Digital Personal Data Protection Act, 2023 and the rules framed under these statutes.$b$,
            2
        ),
        (
            '03 Rights of the Users',
            $b$When you use our Platform or avail our Services, you have the following rights:

(a) Right to access information about your Personal Data. Subject to applicable laws, you may at any time raise a request for: (i) a summary of your Personal Data being processed by us and the processing activities undertaken by us with respect to your Personal Data; (ii) identities of third parties with whom your Personal Data has been shared along with a description of the Personal Data shared; and (iii) any other information regarding your Personal Data and its processing.

(b) Right to correction and erasure of Personal Data. You have the right to correction, completion, updation, and erasure of your Personal Data for which you have previously given us consent. We will at our end proceed to erase your Personal Data stored by us (including those stored with third parties to whom we had shared your Personal Data for processing on our behalf) within such reasonable time once the purpose for such data is no longer being served subject to applicable laws and this Policy.

(c) Right of grievance redressal. You have the right to readily available means of grievance redressal in respect of any act or omission of ours regarding the performance and obligations in relation to your Personal Data.

(d) Right to nominate. You may nominate, in such manner as may be prescribed, any other individual, who shall, in any unfortunate event of death or incapacity exercise rights on your behalf in accordance with the applicable law. We will request details of your nominee at the time of taking your consent.

(e) Right to withdraw consent. You have the right to withdraw your consent at any time, and we shall ensure that the withdrawal of consent is made as easy as the giving of consent. Once you have withdrawn your consent, we will cease to use, collect, process, or store your Personal Data subject to applicable laws and this Policy.

(f) Right to file a complaint with the Data Protection Board. You have the right to file a complaint with the Data Protection Board of India in accordance with the Digital Personal Data Protection Act, 2023 and the rules framed thereunder, in respect of any act or omission of MetroGini regarding the performance of its obligations in relation to your Personal Data.

If you wish to exercise any of the above rights, you may write to our Grievance Redressal Officer as identified in this Policy and subject to applicable laws, and terms of this Policy, we will process your request in accordance with our internal grievance redressal process.$b$,
            3
        ),
        (
            '04 Duties of the Users',
            $b$You hereby agree and undertake that you will comply with all the applicable laws pertaining to your use and disclosure of your Personal Data while using the Platform or availing the Services. You agree that you will not impersonate another person while sharing your Personal Data. You also agree that you will not suppress any material information while providing your Personal Data. You will furnish only such information as is verifiably authentic, while exercising the right to correction or erasure under this Policy, subject to applicable laws.$b$,
            4
        ),
        (
            '05 Collection of Personal Data',
            $b$When you use, access, or register on the Platform or avail the Services, we generally collect the following information ("Personal Data"):
• identity and contact details, including full name, email address, mobile number, and date of birth;
• account and credential details, including username, password, and profile photo;
• location details, including city, area, pin code, and GPS/real-time location;
• financial and payment details, including UPI ID, bank account details, card details, and transaction history; and
• communication details, including in-app messages, support queries, and feedback.$b$,
            5
        ),
        (
            '06 Storage and Processing of Personal Data',
            $b$The Personal Data collected by us will be mostly stored electronically. All such Personal Data shall be transmitted and stored by us in encrypted and anonymised form in accordance with the applicable laws to ensure the secrecy and confidentiality of the Personal Data and such information shall not be shared or used except as provided herein.

Subject to applicable laws, we may engage into arrangements with third parties (within or outside India) to collect, store, or process your Personal Data. Any Personal Data transferred to such third parties for processing will only be done if such third parties already have in place such reasonable security standards as may be necessary to avoid any breach or unauthorised disclosure of your Personal Data and complying with the applicable laws. MetroGini shall enter into a written contract with each such third party, either by way of a standalone data processing agreement or by including data protection clauses within the main service agreement with such third party, incorporating appropriate provisions for reasonable security safeguards and other requirements prescribed under applicable laws. By accepting this Policy, you expressly consent to and authorise the sharing of your Personal Data with such third parties for such collection, storage, and processing.$b$,
            6
        ),
        (
            '07 Data Usage',
            $b$We use, collect, store, and process your Personal Data only for the following purposes:
• creating and managing your account;
• processing bookings, pickups, deliveries and payments;
• customer support and grievance handling;
• verification and fraud prevention;
• communicating booking confirmations, invoices, receipts, service updates and notifications;
• improving our products, Services and customer experience;
• analytics, research, quality assurance and business intelligence;
• marketing, promotional campaigns, loyalty programmes, rewards, referrals and customer engagement, where you have provided your consent; and
• complying with applicable legal, regulatory and contractual obligations.$b$,
            7
        ),
        (
            '08 Data Retention',
            $b$Unless necessary for compliance with applicable laws, to resolve disputes, enforce agreements or protect our legitimate business interests, we will retain your Personal Data only for the duration required to fulfil the specified purpose for which it was initially gathered with your consent, after which such Personal Data will be securely deleted or anonymised where appropriate. We hereby affirm that our practise is to retain Personal Data solely for the duration required to fulfil the intended purpose and that we maintain rigorous protocols for review and retention in order to fulfil these obligations. We shall erase all Personal Data collected from you in case you withdraw the consent unless such Personal Data is required for completing the specified purpose for which you had previously consented or towards compliance with any applicable laws. Where we propose to erase your Personal Data on account of prolonged inactivity on the Platform, we shall provide you with prior notice of at least forty-eight (48) hours before such erasure, in accordance with the Digital Personal Data Protection Act, 2023 and the rules framed thereunder.$b$,
            8
        ),
        (
            '09 Sharing of Personal Data',
            $b$We do not sell your Personal Data.

Your Personal Data may be shared, only to the extent reasonably necessary, with our employees, affiliated entities, contracted service providers, logistics partners, laundry partners, payment processors, cloud service providers, communication providers, technology providers, analytics providers, marketing partners, customer support providers and other business partners engaged by us for operating, improving, securing, supporting, communicating, notifying, promoting or delivering our Services. All such parties are required to maintain appropriate confidentiality and security measures.

We may share your information for the following purposes:

• in response to an order, decree, judgment, or subpoena issued by a court or governmental authority for: (i) enforcing any legal claims or rights; (ii) its performance of any judicial or quasi-judicial or regulatory or supervisory function; (iii) prevention, detection, investigation, or prosecution of any offence or contravention of any applicable law; or (iv) enforcement of any national security interests;

• in relation to any negotiations of a merger, demerger, sale of assets, financing, restructuring, or sale of all or part of our business or any part of it;

• for research, archiving, or statistical purposes subject to applicable laws and standards; and/or

• internally within our organization to provide you need-to-know products, services, offers, or promotions.$b$,
            9
        ),
        (
            '10 Payments',
            $b$Payments may be processed through authorised third-party payment service providers. MetroGini does not store your complete card or banking credentials unless required by applicable law or payment regulations.$b$,
            10
        ),
        (
            '11 Cookies and Analytics',
            $b$Our Website and App may use cookies, pixels, SDKs and similar technologies to enhance functionality, measure performance, personalise user experience and improve advertising effectiveness. You may manage your browser or device settings to limit certain tracking technologies where available.$b$,
            11
        ),
        (
            '12 Security and Confidentiality',
            $b$We ensure to undertake all reasonable security practices and procedures including but not limited to appropriate technical and organizational measures to ensure that your Personal Data is protected. Such measures shall include, at a minimum, encryption, obfuscation, masking or the use of virtual tokens for stored Personal Data; access controls over computer resources used to process Personal Data; logs, monitoring and review to enable detection of unauthorised access and remedial action; measures for the continued processing of Personal Data in the event of any loss of access; contractual measures with our Data Processors for reasonable security safeguards; and appropriate training of our personnel involved in the processing of Personal Data. We will update these measures as new technology becomes available, as appropriate. In the event of a personal data breach, we shall notify each affected User and the Data Protection Board of India in the manner and within the timelines prescribed under the Digital Personal Data Protection Act, 2023 and the rules framed thereunder.$b$,
            12
        ),
        (
            '13 Consent',
            $b$We only collect Personal Data with your free, specific, informed, and unambiguous consent, obtained through a clear affirmative action. Depending on the nature of the Personal Data and the purpose of processing, consent will be obtained through one or more of the following mechanisms: (i) a checkbox during sign-up or onboarding on the Platform, which is not pre-ticked and requires you to actively check to signify your consent; (ii) a click-wrap agreement where you click "I Agree" or "Accept" before proceeding; and (iii) an in-app toggle or permission prompt for specific access requests, such as location access or notification access. You agree that we may continue to process your Personal Data until you withdraw your consent.

(a) We do not collect Personal Data unless you give us your free, specific, informed, and unambiguous consent, obtained through a clear affirmative action, and only in a situation where collection or processing of such Personal Data is required by us such as: (i) for a lawful purpose which you have shared your consent or a legitimate use connected with our function or activity or any person on our behalf; and (ii) the collection or processing of the Personal Data is considered necessary for such specified purpose or under law.

(b) While collecting Personal Data directly from you, we will take reasonable steps to ensure that you have the knowledge of:
(i) the fact that the Personal Data is being collected;
(ii) the purpose for which the Personal Data is being collected;
(iii) the intended recipients of the Personal Data;
(iv) the name and address of: (i) the third-party agency (if any) that is collecting the Personal Data; and (ii) the third-party agency (if any) that will retain the Personal Data; and
(v) Your rights under applicable laws including your right to raise a complaint with statutory authorities.$b$,
            13
        ),
        (
            '14 International Users',
            $b$Most of our Platform services are hosted in India. If you are accessing the Platform or availing Services from outside of India, where laws or regulations governing Personal Data collection, use, storage, retention, and disclosure differ from Indian laws, please be advised that your continued use of the Platform or Services may be governed by Indian law, this Policy, the Platform Policies, and any other terms and conditions applicable to our Services.$b$,
            14
        ),
        (
            '15 Public Information',
            $b$Please note that if you choose to share information about yourself (including any Personal Data) in any public areas of the Platform (such as the community discussion forum on the Platform) we consider that information to be publicly available information. Any Personal Data that you include in any content submitted or posted when using the public areas of our Platform can be viewed by the general public, so please consider this before submitting any such information or content. You are solely responsible for any information, including any Personal Data, you disclose on the public areas of the Platform, and any use of such information by any third-parties regardless of whether you permitted or did not permit such use. We cannot control how others use the information that you post to public areas of the Platform.$b$,
            15
        ),
        (
            '16 Children''s Personal Data',
            $b$The Platform is not intended for or directed at persons under the age of eighteen (18) years. MetroGini does not knowingly collect or process Personal Data of any person under the age of eighteen (18) years without the verifiable consent of a parent or lawful guardian in accordance with the Digital Personal Data Protection Act, 2023 and the rules framed thereunder. If we become aware that we have inadvertently collected Personal Data of any such person without such verifiable consent, we shall erase such Personal Data in accordance with applicable laws. MetroGini shall not undertake any tracking, behavioural monitoring, or targeted advertising directed at children.$b$,
            16
        ),
        (
            '17 Review/Updates',
            $b$MetroGini may modify, amend, alter, or update this Policy at any time at its own sole discretion. The updated Policy will be displayed on the Platform and by continuing to use the Services and/or accessing the Platform, you agree to be bound by any such changes/updates made by MetroGini. It is your responsibility to regularly check for such changes/updates. You agree that your continued use signifies acceptance of those changes/updates. You must discontinue using or accessing the Services or Platform if you disagree with such changes/updates to this Policy.$b$,
            17
        ),
        (
            '18 Grievance Redressal and Notice',
            $b$In case of any grievance, you can reach out to our grievance redressal officer ("Grievance Redressal Officer") indicated below:
To: Grievance Officer
Email ID: info@metrogini.com
Postal address: A 103, Cascade, Vasant Oscar, Lbs marg, Mulund west, Mumbai 400080

Any notices or demands to or upon MetroGini shall be made in writing and sent to MetroGini by courier, or certified mail to the above address and email ID. In case you would like us to address any queries regarding exercise of your rights at any time, you can simply choose either of the above options to reach out to us. The Grievance Redressal Officer also serves as the person authorised by MetroGini to respond to queries from Users in relation to the processing of their Personal Data, for the purposes of the Digital Personal Data Protection Act, 2023 and the rules framed thereunder. We shall respond to your grievance or request within a period of ninety (90) days from the date of receipt, or such shorter period as may be prescribed under applicable law. In the event that you are not satisfied with our response, or where we have failed to respond within the said period, you may file a complaint with the Data Protection Board of India in accordance with applicable law.$b$,
            18
        ),
        (
            '19 Date Last Modified',
            $b$This Policy was last modified on July 15, 2026.$b$,
            19
        )
) AS v(title, body, sequence)
WHERE NOT EXISTS (SELECT 1 FROM public.privacy_policy_sections);
