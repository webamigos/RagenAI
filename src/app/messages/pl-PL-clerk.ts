/*
 * =====================================================================================
 * DISCLAIMER:
 * =====================================================================================
 * This localization file is a community contribution and is not officially maintained
 * by Clerk. It has been provided by the community and may not be fully aligned
 * with the current or future states of the main application. Clerk does not guarantee
 * the accuracy, completeness, or timeliness of the translations in this file.
 * Use of this file is at your own risk and discretion.
 * =====================================================================================
 */

import type { LocalizationResource } from '@clerk/types';

export const plPL: LocalizationResource = {
  locale: 'pl-PL',
  __experimental_userVerification: {
    alternativeMethods: {
      actionLink: undefined,
      actionText: undefined,
      blockButton__backupCode: undefined,
      blockButton__emailCode: undefined,
      blockButton__password: undefined,
      blockButton__phoneCode: undefined,
      blockButton__totp: undefined,
      getHelp: {
        blockButton__emailSupport: undefined,
        content: undefined,
        title: undefined,
      },
      subtitle: undefined,
      title: undefined,
    },
    backupCodeMfa: {
      subtitle: undefined,
      title: undefined,
    },
    emailCode: {
      formTitle: undefined,
      resendButton: undefined,
      subtitle: undefined,
      title: undefined,
    },
    noAvailableMethods: {
      message: undefined,
      subtitle: undefined,
      title: undefined,
    },
    password: {
      actionLink: undefined,
      subtitle: undefined,
      title: undefined,
    },
    phoneCode: {
      formTitle: undefined,
      resendButton: undefined,
      subtitle: undefined,
      title: undefined,
    },
    phoneCodeMfa: {
      formTitle: undefined,
      resendButton: undefined,
      subtitle: undefined,
      title: undefined,
    },
    totpMfa: {
      formTitle: undefined,
      subtitle: undefined,
      title: undefined,
    },
  },
  backButton: 'Powrót',
  badge__default: 'Domyślny',
  badge__otherImpersonatorDevice: 'Inne urządzenie osobiste',
  badge__primary: 'Podstawowy',
  badge__requiresAction: 'Wymaga działania',
  badge__thisDevice: 'To urządzenie',
  badge__unverified: 'Niezweryfikowany',
  badge__userDevice: 'Urządzenie użytkownika',
  badge__you: 'Ty',
  createOrganization: {
    formButtonSubmit: 'Załóż organizację',
    invitePage: {
      formButtonReset: 'Pomiń',
    },
    title: 'Załóż organizację',
  },
  dates: {
    lastDay: "Wczoraj o godzinie {{ date | timeString('pl-PL') }}",
    next6Days:
      "{{ date | weekday('pl-PL','long') }} o godzinie {{ date | timeString('pl-PL') }}",
    nextDay: "Jutro o godzinie {{ date | timeString('pl-PL') }}",
    numeric: "{{ date | numeric('pl-PL') }}",
    previous6Days:
      "Ostatni(a) {{ date | weekday('pl-PL','long') }} o godzinie {{ date | timeString('pl-PL') }}",
    sameDay: "Dzisiaj o godzinie {{ date | timeString('pl-PL') }}",
  },
  dividerText: 'lub',
  footerActionLink__useAnotherMethod: 'Użyj innej metody',
  footerPageLink__help: 'Pomoc',
  footerPageLink__privacy: 'Prywatność',
  footerPageLink__terms: 'Warunki',
  formButtonPrimary: 'Kontynuuj',
  formButtonPrimary__verify: 'Zweryfikuj',
  formFieldAction__forgotPassword: 'Zapomniałem/am hasła',
  formFieldError__matchingPasswords: 'Hasła się zgadzają.',
  formFieldError__notMatchingPasswords: 'Hasła się nie zgadzają.',
  formFieldError__verificationLinkExpired:
    'Link do weryfikacji wygasł. Wygeneruj nowy link.',
  formFieldHintText__optional: 'Opcjonalne',
  formFieldHintText__slug:
    'Slug to czytelny dla ludzi identyfikator, który musi być unikalny. Często jest używany w URL.',
  formFieldInputPlaceholder__backupCode: undefined,
  formFieldInputPlaceholder__confirmDeletionUserAccount: 'Usuń konto',
  formFieldInputPlaceholder__emailAddress: undefined,
  formFieldInputPlaceholder__emailAddress_username: undefined,
  formFieldInputPlaceholder__emailAddresses:
    'Wprowadź lub wklej jeden lub więcej adresów e-mail, oddzielonych spacjami lub przecinkami',
  formFieldInputPlaceholder__firstName: undefined,
  formFieldInputPlaceholder__lastName: undefined,
  formFieldInputPlaceholder__organizationDomain: undefined,
  formFieldInputPlaceholder__organizationDomainEmailAddress: undefined,
  formFieldInputPlaceholder__organizationName: undefined,
  formFieldInputPlaceholder__organizationSlug: undefined,
  formFieldInputPlaceholder__password: undefined,
  formFieldInputPlaceholder__phoneNumber: undefined,
  formFieldInputPlaceholder__username: undefined,
  formFieldLabel__automaticInvitations:
    'Włącz automatyczne zaproszenia dla tej domeny',
  formFieldLabel__backupCode: 'Kod zapasowy',
  formFieldLabel__confirmDeletion: 'Confirmation',
  formFieldLabel__confirmPassword: 'Potwierdź hasło',
  formFieldLabel__currentPassword: 'Obecne hasło',
  formFieldLabel__emailAddress: 'Adres e-mail',
  formFieldLabel__emailAddress_username: 'Adres e-mail lub nazwa użytkownika',
  formFieldLabel__emailAddresses: 'Adresy e-mail',
  formFieldLabel__firstName: 'Imię',
  formFieldLabel__lastName: 'Nazwisko',
  formFieldLabel__newPassword: 'Nowe hasło',
  formFieldLabel__organizationDomain: 'Domena',
  formFieldLabel__organizationDomainDeletePending:
    'Usuń zaproszenia i sugestie oczekujące',
  formFieldLabel__organizationDomainEmailAddress: 'Adres e-mail do weryfikacji',
  formFieldLabel__organizationDomainEmailAddressDescription:
    'Wprowadź adres e-mail pod tą domeną, aby otrzymać kod i zweryfikować tę domenę.',
  formFieldLabel__organizationName: 'Nazwa organizacji',
  formFieldLabel__organizationSlug: 'Slug URL',
  formFieldLabel__passkeyName: undefined,
  formFieldLabel__password: 'Hasło',
  formFieldLabel__phoneNumber: 'Numer telefonu',
  formFieldLabel__role: 'Rola',
  formFieldLabel__signOutOfOtherSessions:
    'Wyloguj się ze wszystkich innych urządzeń',
  formFieldLabel__username: 'Nazwa użytkownika',
  impersonationFab: {
    action__signOut: 'Wyloguj',
    title: 'Zalogowano jako {{identifier}}',
  },
  maintenanceMode: undefined,
  membershipRole__admin: 'Administrator',
  membershipRole__basicMember: 'Użytkownik',
  membershipRole__guestMember: 'Gość',
  organizationList: {
    action__createOrganization: 'Stwórz organizację',
    action__invitationAccept: 'Dołącz',
    action__suggestionsAccept: 'Poproś o dołączenie',
    createOrganization: 'Stwórz organizację',
    invitationAcceptedLabel: 'Dołączono',
    subtitle: 'aby kontynuować w {{applicationName}}',
    suggestionsAcceptedLabel: 'Oczekujące',
    title: 'Wybierz konto',
    titleWithoutPersonal: 'Wybierz organizację',
  },
  organizationProfile: {
    badge__automaticInvitation: 'Automatic invitations',
    badge__automaticSuggestion: 'Sugestie automatyczne',
    badge__manualInvitation: 'Brak automatycznego dołączania',
    badge__unverified: 'Niezweryfikowany',
    createDomainPage: {
      subtitle:
        'Dodaj domenę do weryfikacji. Użytkownicy z adresem e-mail pod tą domeną mogą dołączyć do organizacji automatycznie lub poprosić o dołączenie.',
      title: 'Dodaj domenę',
    },
    invitePage: {
      detailsTitle__inviteFailed:
        'Nie udało się wysłać zaproszeń. Napraw poniższe problemy i spróbuj ponownie:',
      formButtonPrimary__continue: 'Wyślij zaproszenia',
      selectDropdown__role: 'Wybierz rolę',
      subtitle: 'Zaproś nowych użytkowników do tej organizacji',
      successMessage: 'Zaproszenia zostały pomyślnie wysłane',
      title: 'Zaproś użytkowników',
    },
    membersPage: {
      action__invite: 'Zaproś',
      activeMembersTab: {
        menuAction__remove: 'Usuń użytkownika',
        tableHeader__actions: undefined,
        tableHeader__joined: 'Dołączył',
        tableHeader__role: 'Rola',
        tableHeader__user: 'Użytkownik',
      },
      detailsTitle__emptyRow: 'Brak użytkowników do wyświetlenia',
      invitationsTab: {
        autoInvitations: {
          headerSubtitle:
            'Zaproś użytkowników poprzez połączenie domeny e-mail z organizacją. Każdy, kto się zarejestruje z adresem e-mail pasującym do tej domeny, może dołączyć do organizacji w każdej chwili.',
          headerTitle: 'Automatyczne zaproszenia',
          primaryButton: 'Zarządzaj zweryfikowanymi domenami',
        },
        table__emptyRow: 'Brak zaproszeń do wyświetlenia',
      },
      invitedMembersTab: {
        menuAction__revoke: 'Anuluj zaproszenie',
        tableHeader__invited: 'Zaproszony',
      },
      requestsTab: {
        autoSuggestions: {
          headerSubtitle:
            'Użytkownicy, których adres e-mail pasuje do domeny, zobaczą sugestię dotyczącą poproszenia o dołączenie do organizacji.',
          headerTitle: 'Sugestie automatyczne',
          primaryButton: 'Zarządzaj zweryfikowanymi domenami',
        },
        menuAction__approve: 'Zatwierdź',
        menuAction__reject: 'Odrzuć',
        tableHeader__requested: 'Poproszono o dostęp',
        table__emptyRow: 'Brak oczekujących poproszeń do wyświetlenia',
      },
      start: {
        headerTitle__invitations: 'Zaproszenia',
        headerTitle__members: 'Użytkownicy',
        headerTitle__requests: 'Requests',
      },
    },
    navbar: {
      description: 'Zarządzaj organizacją.',
      general: 'Główne',
      members: 'Użytkownicy',
      title: 'Organizacja',
    },
    profilePage: {
      dangerSection: {
        deleteOrganization: {
          actionDescription:
            'Wpisz "{{organizationName}}" poniżej, aby kontynuować.',
          messageLine1: 'Jesteś pewien, że chcesz usunąć tę organizację?',
          messageLine2: 'To działanie jest trwałe i nieodwracalne',
          successMessage: 'Usunąłeś organizację.',
          title: 'Usuń organizację',
        },
        leaveOrganization: {
          actionDescription:
            'Wpisz "{{organizationName}}" poniżej, aby kontynuować.',
          messageLine1:
            'Czy na pewno chcesz opuścić tę organizację? Stracisz dostęp do tej organizacji i jej aplikacji.',
          messageLine2: 'Ta akcja jest trwała i nieodwracalna.',
          successMessage: 'Opuściłeś organizację.',
          title: 'Opuść organizację',
        },
        title: 'Zagrożenie',
      },
      domainSection: {
        menuAction__manage: 'Zarządzaj',
        menuAction__remove: 'Usuń',
        menuAction__verify: 'Zweryfikuj',
        primaryButton: 'Dodaj domenę',
        subtitle:
          'Zezwól użytkownikom na dołączenie do organizacji automatycznie lub poproszenie o dołączenie na podstawie zweryfikowanej domeny e-mail.',
        title: 'Zweryfikowane domeny',
      },
      successMessage: 'Organizacja została zaktualizowana.',
      title: 'Profil organizacji',
    },
    removeDomainPage: {
      messageLine1: 'The email domain {{domain}} will be removed.',
      messageLine2:
        'Użytkownicy nie będą mogli dołączyć do organizacji automatycznie po tym.',
      successMessage: '{{domain}} został usunięty.',
      title: 'Usuń domenę',
    },
    start: {
      headerTitle__general: 'Konto organizacji',
      headerTitle__members: 'Użytkownicy',
      profileSection: {
        primaryButton: 'Zaktualizuj profil',
        title: 'Profil organizacji',
        uploadAction__title: 'Logo',
      },
    },
    verifiedDomainPage: {
      dangerTab: {
        calloutInfoLabel:
          'Usuwanie tej domeny wpłynie na zaproszonych użytkowników.',
        removeDomainActionLabel__remove: 'Usuń domenę',
        removeDomainSubtitle: 'Usuń tą domenę ze zweryfikowanych domen',
        removeDomainTitle: 'Usuń domenę',
      },
      enrollmentTab: {
        automaticInvitationOption__description:
          'Użytkownicy są automatycznie zapraszani do dołączenia do organizacji po zarejestrowaniu się i mogą dołączyć w każdej chwili.',
        automaticInvitationOption__label: 'Automatyczne zaproszenia',
        automaticSuggestionOption__description:
          'Użytkownicy otrzymują sugestię dotyczącą poproszenia o dołączenie, ale muszą być zaakceptowane przez administratora, zanim będą mogli dołączyć do organizacji.',
        automaticSuggestionOption__label: 'Sugestie automatyczne',
        calloutInfoLabel:
          'Zmiana trybu dołączania wpłynie tylko na nowych użytkowników.',
        calloutInvitationCountLabel:
          'Oczekujące zaproszenia wysłane do użytkowników: {{count}}',
        calloutSuggestionCountLabel:
          'Oczekujące sugestie wysłane do użytkowników: {{count}}',
        manualInvitationOption__description:
          'Użytkowników można zapraszać tylko ręcznie do organizacji.',
        manualInvitationOption__label: 'Brak automatycznego dołączania',
        subtitle:
          'Wybierz, jak użytkownicy z tej domeny mogą dołączyć do organizacji.',
      },
      start: {
        headerTitle__danger: 'Ostrzeżenie',
        headerTitle__enrollment: 'Opcje dołączania',
      },
      subtitle:
        'Domena {{domain}} jest teraz zweryfikowana. Kontynuuj, wybierając tryb dołączania.',
      title: 'Aktualizuj {{domain}}',
    },
    verifyDomainPage: {
      formSubtitle: 'Wprowadź kod weryfikacyjny wysłany na Twój adres e-mail',
      formTitle: 'Kod weryfikacyjny',
      resendButton: 'Nie otrzymałeś kodu? Wyślij ponownie',
      subtitle:
        'Domena {{domainName}} musi zostać zweryfikowana poprzez e-mail.',
      subtitleVerificationCodeScreen:
        'Kod weryfikacyjny został wysłany na {{emailAddress}}. Wprowadź kod, aby kontynuować.',
      title: 'Zweryfikuj domenę',
    },
  },
  organizationSwitcher: {
    action__createOrganization: 'Utwórz organizację',
    action__invitationAccept: 'Dołącz',
    action__manageOrganization: 'Zarządzaj organizacją',
    action__suggestionsAccept: 'Request to join',
    notSelected: 'Nie wybrano organizacji',
    personalWorkspace: 'Przestrzeń osobista',
    suggestionsAcceptedLabel: 'Oczekujące zatwierdzenie',
  },
  paginationButton__next: 'Następny',
  paginationButton__previous: 'Poprzedni',
  paginationRowText__displaying: 'Wyświetlanie',
  paginationRowText__of: 'z',
  signIn: {
    accountSwitcher: {
      action__addAccount: 'Dodaj konto',
      action__signOutAll: 'Wyloguj się ze wszystkich kont',
      subtitle: 'Wybierz konto, z którego chcesz kontynuować.',
      title: 'Wybierz konto',
    },
    alternativeMethods: {
      actionLink: 'Uzyskaj pomoc',
      actionText: 'Nie masz żadnego z wymienionych?',
      blockButton__backupCode: 'Użyj kodu zapasowego',
      blockButton__emailCode: 'Wyślij kod do {{identifier}}',
      blockButton__emailLink: 'Wyślij link do {{identifier}}',
      blockButton__passkey: undefined,
      blockButton__password: 'Zaloguj się za pomocą hasła',
      blockButton__phoneCode: 'Wyślij kod do {{identifier}}',
      blockButton__totp: 'Użyj aplikacji uwierzytelniającej',
      getHelp: {
        blockButton__emailSupport: 'Wyślij e-mail do pomocy technicznej',
        content:
          'Jeśli masz problem z zalogowaniem się do swojego konta, wyślij do nas e-mail, a postaramy się jak najszybciej przywrócić dostęp.',
        title: 'Uzyskaj pomoc',
      },
      subtitle: 'Facing issues? You can use any of these methods to sign in.',
      title: 'Użyj innego sposobu',
    },
    backupCodeMfa: {
      subtitle: 'aby przejść do {{applicationName}}',
      title: 'Wprowadź kod zapasowy',
    },
    emailCode: {
      formTitle: 'Kod weryfikacyjny',
      resendButton: 'Wyślij kod ponownie',
      subtitle: 'aby kontynuować w {{applicationName}}',
      title: 'Sprawdź swoją pocztę e-mail',
    },
    emailLink: {
      clientMismatch: {
        subtitle: undefined,
        title: undefined,
      },
      expired: {
        subtitle: 'Powróć do oryginalnej karty, aby kontynuować.',
        title: 'Ten link weryfikacyjny wygasł',
      },
      failed: {
        subtitle: 'Powróć do oryginalnej karty, aby kontynuować.',
        title: 'Ten link weryfikacyjny jest nieprawidłowy',
      },
      formSubtitle: 'Użyj linku weryfikacyjnego wysłanego na Twój adres e-mail',
      formTitle: 'Link weryfikacyjny',
      loading: {
        subtitle: 'Zostaniesz przekierowany wkrótce',
        title: 'Logowanie...',
      },
      resendButton: 'Wyślij link ponownie',
      subtitle: 'aby kontynuować w {{applicationName}}',
      title: 'Sprawdź swoją pocztę e-mail',
      unusedTab: {
        title: 'Możesz zamknąć tę kartę',
      },
      verified: {
        subtitle: 'Zostaniesz przekierowany wkrótce',
        title: 'Pomyślnie zalogowano',
      },
      verifiedSwitchTab: {
        subtitle: 'Powróć do oryginalnej karty, aby kontynuować',
        subtitleNewTab: 'Powróć do nowo otwartej karty, aby kontynuować',
        titleNewTab: 'Zalogowano na innej karcie',
      },
    },
    forgotPassword: {
      formTitle: 'Kod resetowania hasła',
      resendButton: 'Nie otrzymałeś kodu? Wyślij ponownie',
      subtitle: 'aby zresetować hasło',
      subtitle_email: 'Najpierw wprowadź kod wysłany na Twój adres e-mail',
      subtitle_phone: 'Najpierw wprowadź kod wysłany na Twój numer telefonu',
      title: 'Zmień hasło',
    },
    forgotPasswordAlternativeMethods: {
      blockButton__resetPassword: 'Zresetuj hasło',
      label__alternativeMethods: 'Lub, zaloguj się innym sposobem',
      title: 'Zapomniałeś hasła?',
    },
    noAvailableMethods: {
      message:
        'Nie można kontynuować logowania. Brak dostępnych czynników uwierzytelniających.',
      subtitle: 'Wystąpił błąd',
      title: 'Nie można się zalogować',
    },
    passkey: {
      subtitle: undefined,
      title: undefined,
    },
    password: {
      actionLink: 'Użyj innego sposobu',
      subtitle: 'aby kontynuować w {{applicationName}}',
      title: 'Wprowadź swoje hasło',
    },
    passwordPwned: {
      title: undefined,
    },
    phoneCode: {
      formTitle: 'Kod weryfikacyjny',
      resendButton: 'Wyślij kod ponownie',
      subtitle: 'aby przejść do {{applicationName}}',
      title: 'Sprawdź swój telefon',
    },
    phoneCodeMfa: {
      formTitle: 'Kod weryfikacyjny',
      resendButton: 'Wyślij kod ponownie',
      subtitle: undefined,
      title: 'Sprawdź swój telefon',
    },
    resetPassword: {
      formButtonPrimary: 'Zmień hasło',
      requiredMessage:
        'Z powodu zabezpieczeń wymagane jest zresetowanie hasła.',
      successMessage:
        'Twoje hasło zostało pomyślnie zmienione. Logowanie, proszę czekać.',
      title: 'Ustaw nowe hasło',
    },
    resetPasswordMfa: {
      detailsLabel: 'Z powodu zabezpieczeń wymagane jest zresetowanie hasła.',
    },
    start: {
      actionLink: 'Zarejestruj się',
      actionLink__use_email: 'Użyj adresu e-mail',
      actionLink__use_email_username:
        'Użyj adresu e-mail lub nazwy użytkownika',
      actionLink__use_passkey: undefined,
      actionLink__use_phone: 'Użyj numeru telefonu',
      actionLink__use_username: 'Użyj nazwy użytkownika',
      actionText: 'Nie masz konta?',
      subtitle: 'aby przejść do {{applicationName}}',
      title: 'Zaloguj się',
    },
    totpMfa: {
      formTitle: 'Kod weryfikacyjny',
      subtitle: undefined,
      title: 'Weryfikacja dwustopniowa',
    },
  },
  signInEnterPasswordTitle: 'Wprowadź swoje hasło',
  signUp: {
    continue: {
      actionLink: 'Zaloguj się',
      actionText: 'Masz już konto?',
      subtitle: 'aby kontynuować w {{applicationName}}',
      title: 'Uzupełnij brakujące pola',
    },
    emailCode: {
      formSubtitle: 'Wprowadź kod weryfikacyjny wysłany na Twój adres e-mail',
      formTitle: 'Kod weryfikacyjny',
      resendButton: 'Wyślij ponownie',
      subtitle: 'aby kontynuować w {{applicationName}}',
      title: 'Zweryfikuj swój adres e-mail',
    },
    emailLink: {
      clientMismatch: {
        subtitle: undefined,
        title: undefined,
      },
      formSubtitle: 'Użyj linku weryfikacyjnego wysłanego na Twój adres e-mail',
      formTitle: 'Link weryfikacyjny',
      loading: {
        title: 'Rejestrowanie...',
      },
      resendButton: 'Wyślij ponownie',
      subtitle: 'aby kontynuować w {{applicationName}}',
      title: 'Zweryfikuj swój adres e-mail',
      verified: {
        title: 'Pomyślnie zarejestrowano',
      },
      verifiedSwitchTab: {
        subtitle: 'Powróć do nowo otwartej karty, aby kontynuować',
        subtitleNewTab: 'Powróć do poprzedniej karty, aby kontynuować',
        title: 'Adres e-mail został pomyślnie zweryfikowany',
      },
    },
    phoneCode: {
      formSubtitle: 'Wprowadź kod weryfikacyjny wysłany na Twój numer telefonu',
      formTitle: 'Kod weryfikacyjny',
      resendButton: 'Wyślij ponownie',
      subtitle: 'aby kontynuować w {{applicationName}}',
      title: 'Zweryfikuj swój numer telefonu',
    },
    start: {
      actionLink: 'Zaloguj się',
      actionLink__use_email: undefined,
      actionLink__use_phone: undefined,
      actionText: 'Masz już konto?',
      subtitle: 'aby kontynuować w {{applicationName}}',
      title: 'Utwórz swoje konto',
    },
  },
  socialButtonsBlockButton: 'Kontynuuj z {{provider|titleize}}',
  socialButtonsBlockButtonManyInView: undefined,
  unstable__errors: {
    already_a_member_in_organization: undefined,
    captcha_invalid:
      'Rejestracja nie powiodła się z powodu niepowodzenia weryfikacji zabezpieczeń. Odśwież stronę, aby spróbować ponownie lub skontaktuj się z pomocą techniczną.',
    captcha_unavailable:
      'Rejestracja nie powiodła się z powodu niepowodzenia weryfikacji botów. Odśwież stronę, aby spróbować ponownie lub skontaktuj się z pomocą techniczną.',
    form_code_incorrect: undefined,
    form_identifier_exists: 'Ten adres e-mail jest już zajęty. Spróbuj inny.',
    form_identifier_exists__email_address:
      'Podany adres e-mail jest już zajęty. Spróbuj inny.',
    form_identifier_exists__phone_number: undefined,
    form_identifier_exists__username: undefined,
    form_identifier_not_found: undefined,
    form_param_format_invalid: undefined,
    form_param_format_invalid__email_address:
      'Adres e-mail musi być prawidłowym adresem e-mail.',
    form_param_format_invalid__phone_number:
      'Numer telefonu musi być w prawidłowym międzynarodowym formacie',
    form_param_max_length_exceeded__first_name:
      'Imię nie może być dłuższe niż 256 znaków.',
    form_param_max_length_exceeded__last_name:
      'Nazwisko nie może być dłuższe niż 256 znaków.',
    form_param_max_length_exceeded__name:
      'Nazwa nie może być dłuższa niż 256 znaków.',
    form_param_nil: undefined,
    form_param_value_invalid: undefined,
    form_password_incorrect: undefined,
    form_password_length_too_short: undefined,
    form_password_not_strong_enough: 'Twoje hasło jest wystarczająco silne.',
    form_password_pwned: 'Twoje hasło wyciekło',
    form_password_pwned__sign_in: undefined,
    form_password_size_in_bytes_exceeded:
      'Twoje hasło przekroczyło maksymalną liczbę bajtów dozwoloną, skróć je lub usuń niektóre znaki specjalne.',
    form_password_validation_failed: 'Podane hasło jest nieprawidłowe',
    form_username_invalid_character: undefined,
    form_username_invalid_length: undefined,
    identification_deletion_failed:
      'Nie możesz usunąć ostatniej identyfikacji.',
    not_allowed_access: undefined,
    organization_domain_blocked: undefined,
    organization_domain_common: undefined,
    organization_membership_quota_exceeded: undefined,
    organization_minimum_permissions_needed: undefined,
    passkey_already_exists: undefined,
    passkey_not_supported: undefined,
    passkey_pa_not_supported: undefined,
    passkey_registration_cancelled: undefined,
    passkey_retrieval_cancelled: undefined,
    passwordComplexity: {
      maximumLength: 'mniej niż {{length}} znaków',
      minimumLength: '{{length}} lub więcej znaków',
      requireLowercase: 'małą literę',
      requireNumbers: 'cyfrę',
      requireSpecialCharacter: 'znak specjalny',
      requireUppercase: 'wielką literę',
      sentencePrefix: 'Twoje hasło musi zawierać',
    },
    phone_number_exists: 'Ten numer telefonu jest zajęty. Spróbuj inny.',
    zxcvbn: {
      couldBeStronger:
        'Twoje hasło działa, ale może być silniejsze. Spróbuj dodać więcej znaków.',
      goodPassword: 'Twoje hasło spełnia wszystkie wymagania.',
      notEnough: 'Twoje hasło jest wystarczająco silne.',
      suggestions: {
        allUppercase: 'Capitalize some, but not all letters.',
        anotherWord: 'Dodaj więcej słów, które są mniej powszechne.',
        associatedYears: 'Unikaj lat, które są związane z Tobą.',
        capitalization: 'Zwiększ wielkość liter, ale nie wszystkie.',
        dates: 'Unikaj dat i lat, które są związane z Tobą.',
        l33t: "Unikaj przewidywalnych zamian liter, np. '@' zamiast 'a'.",
        longerKeyboardPattern:
          'Użyj dłuższych wzorów klawiatury i zmieniaj kierunek pisania wiele razy.',
        noNeed:
          'Możesz tworzyć silne hasła bez użycia symboli, cyfr lub wielkich liter.',
        pwned: 'Jeśli używasz tego hasła gdzie indziej, powinieneś je zmienić.',
        recentYears: 'Unikaj ostatnich lat.',
        repeated: 'Unikaj powtarzających się słów i znaków.',
        reverseWords: 'Unikaj odwróconych pisowni słów powszechnych.',
        sequences: 'Unikaj wspólnych sekwencji znaków.',
        useWords: 'Użyj wielu słów, ale unikaj wspólnych fraz.',
      },
      warnings: {
        common: 'To jest powszechnie używane hasło.',
        commonNames: 'Nazwiska i imiona są łatwe do odgadnięcia.',
        dates: 'Daty są łatwe do odgadnięcia.',
        extendedRepeat:
          'Powtarzające się wzory znaków, np. "abcabcabc", są łatwe do odgadnięcia.',
        keyPattern: 'Krótkie wzory klawiatury są łatwe do odgadnięcia.',
        namesByThemselves:
          'Pojedyncze nazwiska lub imiona są łatwe do odgadnięcia.',
        pwned: 'Twoje hasło zostało ujawnione w wyniku naruszenia danych.',
        recentYears: 'Ostatnie lata są łatwe do odgadnięcia.',
        sequences:
          'Wspólne sekwencje znaków, np. "abc", są łatwe do odgadnięcia.',
        similarToCommon: 'To jest podobne do powszechnie używanego hasła.',
        simpleRepeat:
          'Powtarzające się znaki, np. "aaa", są łatwe do odgadnięcia.',
        straightRow:
          'Bezpośrednie wiersze klawiszy na Twojej klawiaturze są łatwe do odgadnięcia.',
        topHundred: 'This is a frequently used password.',
        topTen: 'To jest powszechnie używane hasło.',
        userInputs:
          'Nie powinno być żadnych danych osobistych ani powiązanych z stroną.',
        wordByItself: 'Pojedyncze słowa są łatwe do odgadnięcia.',
      },
    },
  },
  userButton: {
    action__addAccount: 'Dodaj konto',
    action__manageAccount: 'Zarządzaj kontem',
    action__signOut: 'Wyloguj',
    action__signOutAll: 'Wyloguj ze wszystkich kont',
  },
  userProfile: {
    backupCodePage: {
      actionLabel__copied: 'Skopiowane!',
      actionLabel__copy: 'Skopiuj wszystkie',
      actionLabel__download: 'Pobierz .txt',
      actionLabel__print: 'Drukuj',
      infoText1: 'Kody zapasowe zostaną włączone dla tego konta.',
      infoText2:
        'Przechowuj kody zapasowe w tajemnicy i bezpiecznie. Możesz wygenerować nowe kody, jeśli podejrzewasz, że zostały skompromitowane.',
      subtitle__codelist: 'Przechowuj je bezpiecznie i zachowaj w tajemnicy.',
      successMessage:
        'Kody zapasowe są teraz włączone. Możesz użyć jednego z tych kodów do zalogowania się na swoje konto, jeśli utracisz dostęp do urządzenia uwierzytelniającego. Każdy kod można użyć tylko raz.',
      successSubtitle:
        'Możesz użyć jednego z tych kodów do zalogowania się na swoje konto, jeśli utracisz dostęp do urządzenia uwierzytelniającego.',
      title: 'Dodaj weryfikację kodem zapasowym',
      title__codelist: 'Kody zapasowe',
    },
    connectedAccountPage: {
      formHint: 'Wybierz dostawcę, aby połączyć konto.',
      formHint__noAccounts: 'Nie ma dostępnych zewnętrznych dostawców kont.',
      removeResource: {
        messageLine1: '{{identifier}} zostanie usunięte z tego konta.',
        messageLine2:
          'Nie będziesz już mógł korzystać z tego połączonego konta i wszystkie zależne funkcje przestaną działać.',
        successMessage: '{{connectedAccount}} został usunięty z Twojego konta.',
        title: 'Usuń połączone konto',
      },
      socialButtonsBlockButton: 'Połącz konto {{provider|titleize}}',
      successMessage: 'Dostawca został dodany do Twojego konta.',
      title: 'Dodaj połączone konto',
    },
    deletePage: {
      actionDescription: 'Wpisz "Delete account" poniżej aby kontynuować.',
      confirm: 'Usuń konto',
      messageLine1: 'Czy na pewno chcesz usunąć to konto?',
      messageLine2: 'To działanie jest nieodwracalne.',
      title: 'Usuń konto',
    },
    emailAddressPage: {
      emailCode: {
        formHint:
          'E-mail zawierający kod weryfikacyjny zostanie wysłany na ten adres e-mail.',
        formSubtitle:
          'Wprowadź kod weryfikacyjny wysłany na adres {{identifier}}',
        formTitle: 'Kod weryfikacyjny',
        resendButton: 'Wyślij ponownie kod',
        successMessage:
          'Adres e-mail {{identifier}} został dodany do twojego konta.',
      },
      emailLink: {
        formHint:
          'E-mail zawierający link weryfikacyjny zostanie wysłany na ten adres e-mail.',
        formSubtitle:
          'Kliknij w link weryfikacyjny w e-mailu wysłanym na adres {{identifier}}',
        formTitle: 'Link weryfikacyjny',
        resendButton: 'Wyślij ponownie link',
        successMessage:
          'Adres e-mail {{identifier}} został dodany do twojego konta.',
      },
      removeResource: {
        messageLine1: '{{identifier}} zostanie usunięty z tego konta.',
        messageLine2:
          'Nie będzie już możliwe zalogowanie się za pomocą tego adresu e-mail.',
        successMessage: '{{emailAddress}} został usunięty z twojego konta.',
        title: 'Usuń adres e-mail',
      },
      title: 'Dodaj adres e-mail',
      verifyTitle: 'Verify email address',
    },
    formButtonPrimary__add: 'Dodaj',
    formButtonPrimary__continue: 'Kontynuuj',
    formButtonPrimary__finish: 'Zakończ',
    formButtonPrimary__remove: 'Usuń',
    formButtonPrimary__save: 'Zapisz',
    formButtonReset: 'Anuluj',
    mfaPage: {
      formHint: 'Wybierz metodę dodania.',
      title: 'Dodaj weryfikację dwuetapową',
    },
    mfaPhoneCodePage: {
      backButton: 'Użyj istniejącego numeru',
      primaryButton__addPhoneNumber: 'Dodaj numer telefonu',
      removeResource: {
        messageLine1:
          '{{identifier}} nie będzie już otrzymywał kodów weryfikacyjnych podczas logowania.',
        messageLine2:
          'Twoje konto może być mniej bezpieczne. Czy na pewno chcesz kontynuować?',
        successMessage:
          'Weryfikacja kodem SMS w dwustopniowym procesie uwierzytelniania została usunięta dla {{mfaPhoneCode}}',
        title: 'Usuń dwustopniową weryfikację',
      },
      subtitle__availablePhoneNumbers:
        'Wybierz numer telefonu, aby zarejestrować weryfikację kodem SMS w dwustopniowym procesie uwierzytelniania.',
      subtitle__unavailablePhoneNumbers:
        'Brak dostępnych numerów telefonów do zarejestrowania weryfikacji kodem SMS w dwustopniowym procesie uwierzytelniania.',
      successMessage1:
        'Podczas logowania będziesz musiał wprowadzić kod weryfikacyjny wysłany na ten numer telefonu.',
      successMessage2:
        'Zapisz te kody zapasowe i przechowuj je w bezpiecznym miejscu. Jeśli utracisz dostęp do urządzenia uwierzytelniającego, możesz użyć kodów zapasowych do zalogowania.',
      successTitle:
        'Weryfikacja kodem SMS w dwustopniowym procesie uwierzytelniania włączona',
      title: 'Dodaj weryfikację kodem SMS',
    },
    mfaTOTPPage: {
      authenticatorApp: {
        buttonAbleToScan__nonPrimary: 'Zamiast tego zeskanuj kod QR',
        buttonUnableToScan__nonPrimary: 'Nie można zeskanować kodu QR?',
        infoText__ableToScan:
          'Ustaw nową metodę logowania w swojej aplikacji autentykacyjnej i zeskanuj następujący kod QR, aby połączyć go z Twoim kontem.',
        infoText__unableToScan:
          'Ustaw nową metodę logowania w swojej aplikacji autentykacyjnej i wprowadź poniższy klucz.',
        inputLabel__unableToScan1:
          'Upewnij się, że włączona jest opcja jednorazowe hasła lub hasła oparte na czasie, a następnie zakończ łączenie konta.',
        inputLabel__unableToScan2:
          'Alternatywnie, jeśli Twoja aplikacja autentykacyjna obsługuje URI TOTP, możesz również skopiować pełny URI.',
      },
      removeResource: {
        messageLine1:
          'Kody weryfikacyjne z tej aplikacji autentykacyjnej nie będą już wymagane podczas logowania.',
        messageLine2:
          'Twoje konto może być mniej bezpieczne. Czy na pewno chcesz kontynuować?',
        successMessage:
          'Weryfikacja dwuetapowa za pomocą aplikacji autentykacyjnej została usunięta.',
        title: 'Usuń weryfikację dwuetapową',
      },
      successMessage:
        'Weryfikacja dwuetapowa jest teraz włączona. Przy logowaniu będziesz musiał wprowadzić kod weryfikacyjny z tej aplikacji jako dodatkowy krok.',
      title: 'Dodaj aplikację autentykacyjną',
      verifySubtitle:
        'Wprowadź kod weryfikacyjny wygenerowany przez Twoją aplikację autentykacyjną',
      verifyTitle: 'Kod weryfikacyjny',
    },
    mobileButton__menu: 'Menu',
    navbar: {
      account: 'Profil',
      description: 'Zarządzaj danymi konta.',
      security: 'Bezpieczeństwo',
      title: 'Konto',
    },
    passkeyScreen: {
      removeResource: {
        messageLine1: undefined,
        title: undefined,
      },
      subtitle__rename: undefined,
      title__rename: undefined,
    },
    passwordPage: {
      checkboxInfoText__signOutOfOtherSessions:
        'Zaleca się wylogowanie się z wszystkich innych urządzeń, które mogły używać Twojego starego hasła.',
      readonly:
        'Twoje hasło nie może być obecnie edytowane, ponieważ możesz się tylko logować za pośrednictwem połączenia firmowego.',
      successMessage__set: 'Twoje hasło zostało ustawione.',
      successMessage__signOutOfOtherSessions:
        'Wylogowano z wszystkich innych urządzeń.',
      successMessage__update: 'Twoje hasło zostało zaktualizowane.',
      title__set: 'Ustaw hasło',
      title__update: 'Zmień hasło',
    },
    phoneNumberPage: {
      infoText:
        'Wiadomość tekstowa zawierająca link weryfikacyjny zostanie wysłana na ten numer telefonu.',
      removeResource: {
        messageLine1: '{{identifier}} zostanie usunięty z tego konta.',
        messageLine2:
          'Nie będzie już możliwe zalogowanie się za pomocą tego numeru telefonu.',
        successMessage: '{{phoneNumber}} został usunięty z twojego konta.',
        title: 'Usuń numer telefonu',
      },
      successMessage: '{{identifier}} został dodany do twojego konta.',
      title: 'Dodaj numer telefonu',
      verifySubtitle: 'Wpisz kod weryfikacyjny wysłany na {{identifier}}',
      verifyTitle: 'Zweryfikuj numer telefonu',
    },
    profilePage: {
      fileDropAreaHint:
        'Prześlij zdjęcie w formacie JPG, PNG, GIF lub WEBP mniejsze niż 10 MB',
      imageFormDestructiveActionSubtitle: 'Usuń zdjęcie',
      imageFormSubtitle: 'Prześlij zdjęcie',
      imageFormTitle: 'Zdjęcie profilowe',
      readonly:
        'Informacje o Twoim profilu zostały dostarczone za pośrednictwem połączenia firmowego i nie mogą być edytowane.',
      successMessage: 'Twój profil został zaktualizowany.',
      title: 'Edytuj profil',
    },
    start: {
      activeDevicesSection: {
        destructiveAction: 'Wyloguj z urządzenia',
        title: 'Aktywne urządzenia',
      },
      connectedAccountsSection: {
        actionLabel__connectionFailed: 'Spróbuj ponownie',
        actionLabel__reauthorize: 'Autoryzuj teraz',
        destructiveActionTitle: 'Odłącz',
        primaryButton: 'Połącz konto',
        subtitle__disconnected: undefined,
        subtitle__reauthorize:
          'Wymagane zakresy zostały zaktualizowane, a możesz doświadczać ograniczonej funkcjonalności. Proszę ponownie autoryzować tę aplikację, aby uniknąć jakichkolwiek problemów',
        title: 'Połączone konta',
      },
      dangerSection: {
        deleteAccountButton: 'Usuń konto',
        title: 'Niebezpieczeństwo',
      },
      emailAddressesSection: {
        destructiveAction: 'Usuń adres email',
        detailsAction__nonPrimary: 'Ustaw jako główny',
        detailsAction__primary: 'Zakończ weryfikację',
        detailsAction__unverified: 'Zakończ weryfikację',
        primaryButton: 'Dodaj adres email',
        title: 'Adresy email',
      },
      enterpriseAccountsSection: {
        title: 'Enterprise accounts',
      },
      headerTitle__account: 'Konto',
      headerTitle__security: 'Bezpieczeństwo',
      mfaSection: {
        backupCodes: {
          actionLabel__regenerate: 'Wygeneruj kody',
          headerTitle: 'Kody zapasowe',
          subtitle__regenerate:
            'Otrzymaj nowy zestaw bezpiecznych kodów zapasowych. Poprzednie kody zapasowe zostaną usunięte i nie będą działać.',
          title__regenerate: 'Wygeneruj nowe kody zapasowe',
        },
        phoneCode: {
          actionLabel__setDefault: 'Ustaw jako domyślny',
          destructiveActionLabel: 'Usuń numer telefonu',
        },
        primaryButton: 'Dodaj weryfikację dwuetapową',
        title: 'Weryfikacja dwuetapowa',
        totp: {
          destructiveActionTitle: 'Usuń',
          headerTitle: 'Aplikacja autoryzacyjna',
        },
      },
      passkeysSection: {
        menuAction__destructive: undefined,
        menuAction__rename: undefined,
        title: undefined,
      },
      passwordSection: {
        primaryButton__setPassword: 'Ustaw hasło',
        primaryButton__updatePassword: 'Zmień hasło',
        title: 'Hasło',
      },
      phoneNumbersSection: {
        destructiveAction: 'Usuń numer telefonu',
        detailsAction__nonPrimary: 'Ustaw jako główny',
        detailsAction__primary: 'Zakończ weryfikację',
        detailsAction__unverified: 'Zakończ weryfikację',
        primaryButton: 'Dodaj numer telefonu',
        title: 'Numery telefonów',
      },
      profileSection: {
        primaryButton: 'Zaktualizuj profil',
        title: 'Profil',
      },
      usernameSection: {
        primaryButton__setUsername: 'Ustaw nazwę użytkownika',
        primaryButton__updateUsername: 'Zmień nazwę użytkownika',
        title: 'Nazwa użytkownika',
      },
      web3WalletsSection: {
        destructiveAction: 'Usuń portfel',
        primaryButton: 'Portfele Web3',
        title: 'Portfele Web3',
      },
    },
    usernamePage: {
      successMessage: 'Twoja nazwa użytkownika została zaktualizowana.',
      title__set: 'Zmień nazwę użytkownika',
      title__update: 'Zmień nazwę użytkownika',
    },
    web3WalletPage: {
      removeResource: {
        messageLine1: '{{identifier}} zostanie usunięty z tego konta.',
        messageLine2:
          'Nie będziesz już mógł się zalogować za pomocą tego portfela web3.',
        successMessage: '{{web3Wallet}} został usunięty z Twojego konta.',
        title: 'Usuń portfel web3',
      },
      subtitle__availableWallets:
        'Wybierz portfel web3 do połączenia z Twoim kontem.',
      subtitle__unavailableWallets: 'Nie ma dostępnych portfeli web3.',
      successMessage: 'Portfel został dodany do Twojego konta.',
      title: 'Dodaj portfel web3',
      web3WalletButtonsBlockButton: undefined,
    },
  },
} as const;
