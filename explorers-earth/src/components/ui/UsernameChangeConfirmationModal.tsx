import React from "react";
import { useTranslation } from "react-i18next";
import Modal from "./Modal";

interface UsernameChangeConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  newUsername: string;
  cooldownDays: number; // Can be fractional for testing (e.g., 1/1440 for 1 minute)
}

/**
 * Username Change Confirmation Modal
 *
 * Purpose: Shows a warning modal when users attempt to change their username,
 * informing them about the impact on their profile links and QR codes.
 *
 * Cooldown Integration: The modal displays the current cooldown period (configurable)
 * and warns users they won't be able to change username again for that duration.
 *
 * Links Impact: Dynamically shows how their new username will affect:
 * - Profile URL: explorers.earth/{newUsername}
 * - Places list URL: explorers.earth/{newUsername}/places
 */
const UsernameChangeConfirmationModal: React.FC<
  UsernameChangeConfirmationModalProps
> = ({ isOpen, onClose, onConfirm, newUsername, cooldownDays }) => {
  const { t } = useTranslation();

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h2 className="mb-3 text-lg font-semibold text-dashboard">
          {t('modal.usernameChange.title')}
        </h2>
        <div className="space-y-3 text-sm text-dashboard-light">
          <p>{t('modal.usernameChange.description')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-dashboard">{t('modal.usernameChange.profileLabel')}</span>{" "}
              <code className="break-all rounded bg-dashboard-muted px-1 text-xs text-dashboard">
                explorers.earth/{newUsername}
              </code>
            </li>
            <li>
              <span className="font-medium text-dashboard">{t('modal.usernameChange.listLabel')}</span>{" "}
              <code className="break-all rounded bg-dashboard-muted px-1 text-xs text-dashboard">
                explorers.earth/{newUsername}/places
              </code>
            </li>
          </ul>
          <p>{t('modal.usernameChange.warning')}</p>
          <p className="text-dashboard">
            {t('modal.usernameChange.cooldownPrefix')}{" "}
            {cooldownDays < 1
              ? t('modal.usernameChange.minute')
              : cooldownDays === 1
                ? t('modal.usernameChange.day')
                : `${cooldownDays} ${t('modal.usernameChange.days')}`}{" "}
            {t('modal.usernameChange.cooldownSuffix')}
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            className="rounded-md border border-dashboard px-4 py-2 text-dashboard transition-colors hover:bg-dashboard-muted"
          >
            {t('modal.usernameChange.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-700 px-4 py-2 text-white transition-colors hover:bg-red-800"
          >
            {t('modal.usernameChange.confirm')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default UsernameChangeConfirmationModal;
