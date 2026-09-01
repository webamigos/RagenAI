// TODO: i18n
export const getUserResponseEmailContent = (title: string, message: string) => {
  return {
    subject: `[Ragen Support] Kopia Twojej wiadomości: ${title}`,
    text: `Dziękujemy za kontakt z Ragen!\n\nOtrzymaliśmy Twoją wiadomość:\n\n${message}\n\nSkontaktujemy się z Tobą wkrótce.`,
  };
};
