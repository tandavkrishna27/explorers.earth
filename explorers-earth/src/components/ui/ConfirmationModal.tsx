import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "./Button";
import DialogPanel from "../../components/ui/DialogPanel";

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    isLoading?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    isDanger = false,
    isLoading = false,
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={!isLoading ? onClose : undefined}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
                    />

                    {/* Modal */}
                    <DialogPanel onClose={() => { if (!isLoading) onClose(); }}
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                        className="fixed inset-0 z-[10000] flex items-center justify-center p-4 dashboard-theme"
                    >
                        <div className="bg-dashboard-sidebar rounded-2xl shadow-2xl border border-dashboard-muted w-full max-w-sm overflow-hidden flex flex-col">
                            {/* Content */}
                            <div className="p-6">
                                <h2 className="text-dashboard font-poppins font-bold text-lg mb-2">
                                    {title}
                                </h2>
                                <p className="text-dashboard-light text-sm font-poppins">
                                    {message}
                                </p>
                            </div>

                            {/* Footer */}
                            <div className="bg-dashboard-sidebar border-t border-dashboard-muted p-4 flex gap-3 justify-end items-center">
                                <Button
                                    variant="ghost"
                                    onClickHandler={onClose}
                                    btnText={cancelText}
                                    disabled={isLoading}
                                />
                                <Button
                                    variant="primary"
                                    onClickHandler={onConfirm}
                                    btnText={confirmText}
                                    isLoading={isLoading}
                                    className={isDanger ? "!bg-dashboard-danger !text-white hover:!bg-dashboard-danger/90 border-none rounded-md" : ""}
                                />
                            </div>
                        </div>
                    </DialogPanel>
                </>
            )}
        </AnimatePresence>
    );
};

export default ConfirmationModal;
