(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-BATCH-ID u101)
(define-constant ERR-INVALID-STATUS u102)
(define-constant ERR-INVALID-ROLE u103)
(define-constant ERR-BATCH-NOT-FOUND u104)
(define-constant ERR-ALREADY-PROCESSED u105)
(define-constant ERR-INVALID-TIMESTAMP u106)
(define-constant ERR-ORACLE-NOT-VERIFIED u107)
(define-constant ERR-INVALID-ACTOR u108)
(define-constant ERR-INVALID-TRANSFER u109)
(define-constant ERR-INVALID-UPDATE u110)
(define-constant ERR-MAX-HISTORY-EXCEEDED u111)
(define-constant ERR-INVALID-MATERIAL-TYPE u112)
(define-constant ERR-INVALID-WEIGHT u113)
(define-constant ERR-INVALID-LOCATION u114)
(define-constant ERR-INVALID-VERIFICATION-PROOF u115)
(define-constant ERR-BATCH-ALREADY-EXISTS u116)
(define-constant ERR-INVALID-CUSTODY-CHANGE u117)
(define-constant ERR-INVALID-QUERY u118)
(define-constant ERR-INSUFFICIENT-PERMISSIONS u119)
(define-constant ERR-INVALID-CONTRACT-CALL u120)

(define-constant STATUS-DEPOSITED u1)
(define-constant STATUS-COLLECTED u2)
(define-constant STATUS-IN_TRANSIT u3)
(define-constant STATUS-PROCESSED u4)
(define-constant STATUS-REJECTED u5)

(define-constant ROLE-CONSUMER u1)
(define-constant ROLE-COLLECTOR u2)
(define-constant ROLE-PROCESSOR u3)

(define-data-var next-log-id uint u0)
(define-data-var max-history-per-batch uint u50)
(define-data-var oracle-contract (optional principal) none)
(define-data-var user-registry-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var material-batch-contract principal 'SP000000000000000000002Q6VF78)

(define-map batch-statuses
  uint
  {
    current-status: uint,
    last-update-timestamp: uint,
    current-custodian: principal,
    material-type: (string-utf8 50),
    weight: uint,
    deposit-location: (string-utf8 100)
  }
)

(define-map batch-history
  { batch-id: uint, log-id: uint }
  {
    action: (string-utf8 50),
    actor: principal,
    timestamp: uint,
    proof-hash: (buff 32),
    notes: (string-utf8 200)
  }
)

(define-map batch-history-count
  uint
  uint
)

(define-read-only (get-batch-status (batch-id uint))
  (map-get? batch-statuses batch-id)
)

(define-read-only (get-batch-history-entry (batch-id uint) (log-id uint))
  (map-get? batch-history { batch-id: batch-id, log-id: log-id })
)

(define-read-only (get-batch-history-count (batch-id uint))
  (default-to u0 (map-get? batch-history-count batch-id))
)

(define-private (validate-batch-id (batch-id uint))
  (if (> batch-id u0)
      (ok true)
      (err ERR-INVALID-BATCH-ID))
)

(define-private (validate-status (status uint))
  (if (or (is-eq status STATUS-DEPOSITED) (is-eq status STATUS-COLLECTED) (is-eq status STATUS-IN_TRANSIT) (is-eq status STATUS-PROCESSED) (is-eq status STATUS-REJECTED))
      (ok true)
      (err ERR-INVALID-STATUS))
)

(define-private (validate-role (role uint))
  (if (or (is-eq role ROLE-CONSUMER) (is-eq role ROLE-COLLECTOR) (is-eq role ROLE-PROCESSOR))
      (ok true)
      (err ERR-INVALID-ROLE))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-material-type (mtype (string-utf8 50)))
  (if (and (> (len mtype) u0) (<= (len mtype) u50))
      (ok true)
      (err ERR-INVALID-MATERIAL-TYPE))
)

(define-private (validate-weight (weight uint))
  (if (> weight u0)
      (ok true)
      (err ERR-INVALID-WEIGHT))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-proof-hash (phash (buff 32)))
  (if (is-eq (len phash) u32)
      (ok true)
      (err ERR-INVALID-VERIFICATION-PROOF))
)

(define-private (validate-actor (actor principal))
  (if (not (is-eq actor 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-ACTOR))
)

(define-private (get-user-role (user principal))
  (contract-call? .user-registry get-role user)
)

(define-private (is-authorized-role (required-role uint))
  (let ((role (unwrap! (get-user-role tx-sender) (err ERR-NOT-AUTHORIZED))))
    (if (is-eq role required-role)
        (ok true)
        (err ERR-INSUFFICIENT-PERMISSIONS)))
)

(define-private (verify-oracle-proof (proof (buff 32)))
  (let ((oracle (unwrap! (var-get oracle-contract) (err ERR-ORACLE-NOT-VERIFIED))))
    (contract-call? .verification-oracle verify-proof proof tx-sender))
)

(define-public (set-oracle-contract (contract-principal principal))
  (begin
    (try! (validate-actor contract-principal))
    (asserts! (is-none (var-get oracle-contract)) (err ERR-ORACLE-NOT-VERIFIED))
    (var-set oracle-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-history-per-batch (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE))
    (asserts! (is-some (var-get oracle-contract)) (err ERR-ORACLE-NOT-VERIFIED))
    (var-set max-history-per-batch new-max)
    (ok true)
  )
)

(define-public (log-batch-deposit (batch-id uint) (mtype (string-utf8 50)) (weight uint) (loc (string-utf8 100)) (proof (buff 32)))
  (begin
    (try! (is-authorized-role ROLE-CONSUMER))
    (try! (validate-batch-id batch-id))
    (try! (validate-material-type mtype))
    (try! (validate-weight weight))
    (try! (validate-location loc))
    (try! (validate-proof-hash proof))
    (try! (verify-oracle-proof proof))
    (asserts! (is-none (map-get? batch-statuses batch-id)) (err ERR-BATCH-ALREADY-EXISTS))
    (map-set batch-statuses batch-id
      {
        current-status: STATUS-DEPOSITED,
        last-update-timestamp: block-height,
        current-custodian: tx-sender,
        material-type: mtype,
        weight: weight,
        deposit-location: loc
      }
    )
    (let ((log-count (get-batch-history-count batch-id)))
      (asserts! (< log-count (var-get max-history-per-batch)) (err ERR-MAX-HISTORY-EXCEEDED))
      (map-set batch-history { batch-id: batch-id, log-id: log-count }
        {
          action: u"deposit",
          actor: tx-sender,
          timestamp: block-height,
          proof-hash: proof,
          notes: u"Initial deposit"
        }
      )
      (map-set batch-history-count batch-id (+ log-count u1))
    )
    (print { event: "batch-deposited", id: batch-id })
    (ok true)
  )
)

(define-public (transfer-custody (batch-id uint) (new-custodian principal) (proof (buff 32)) (notes (string-utf8 200)))
  (let ((status (map-get? batch-statuses batch-id)))
    (match status
      s
        (begin
          (try! (is-authorized-role ROLE-COLLECTOR))
          (try! (validate-actor new-custodian))
          (try! (validate-proof-hash proof))
          (try! (verify-oracle-proof proof))
          (asserts! (is-eq (get current-custodian s) tx-sender) (err ERR-INVALID-CUSTODY-CHANGE))
          (asserts! (not (is-eq (get current-status s) STATUS-PROCESSED)) (err ERR-ALREADY-PROCESSED))
          (map-set batch-statuses batch-id
            (merge s {
              current-status: STATUS_IN_TRANSIT,
              last-update-timestamp: block-height,
              current-custodian: new-custodian
            })
          )
          (let ((log-count (get-batch-history-count batch-id)))
            (asserts! (< log-count (var-get max-history-per-batch)) (err ERR-MAX-HISTORY-EXCEEDED))
            (map-set batch-history { batch-id: batch-id, log-id: log-count }
              {
                action: u"custody-transfer",
                actor: tx-sender,
                timestamp: block-height,
                proof-hash: proof,
                notes: notes
              }
            )
            (map-set batch-history-count batch-id (+ log-count u1))
          )
          (print { event: "custody-transferred", id: batch-id, to: new-custodian })
          (ok true)
        )
      (err ERR-BATCH-NOT-FOUND)
    )
  )
)

(define-public (mark-processed (batch-id uint) (proof (buff 32)) (notes (string-utf8 200)))
  (let ((status (map-get? batch-statuses batch-id)))
    (match status
      s
        (begin
          (try! (is-authorized-role ROLE-PROCESSOR))
          (try! (validate-proof-hash proof))
          (try! (verify-oracle-proof proof))
          (asserts! (is-eq (get current-custodian s) tx-sender) (err ERR-INVALID-CUSTODY-CHANGE))
          (asserts! (not (is-eq (get current-status s) STATUS-PROCESSED)) (err ERR-ALREADY-PROCESSED))
          (map-set batch-statuses batch-id
            (merge s {
              current-status: STATUS-PROCESSED,
              last-update-timestamp: block-height
            })
          )
          (let ((log-count (get-batch-history-count batch-id)))
            (asserts! (< log-count (var-get max-history-per-batch)) (err ERR-MAX-HISTORY-EXCEEDED))
            (map-set batch-history { batch-id: batch-id, log-id: log-count }
              {
                action: u"processed",
                actor: tx-sender,
                timestamp: block-height,
                proof-hash: proof,
                notes: notes
              }
            )
            (map-set batch-history-count batch-id (+ log-count u1))
          )
          (print { event: "batch-processed", id: batch-id })
          (ok true)
        )
      (err ERR-BATCH-NOT-FOUND)
    )
  )
)

(define-public (reject-batch (batch-id uint) (proof (buff 32)) (notes (string-utf8 200)))
  (let ((status (map-get? batch-statuses batch-id)))
    (match status
      s
        (begin
          (try! (is-authorized-role ROLE-PROCESSOR))
          (try! (validate-proof-hash proof))
          (try! (verify-oracle-proof proof))
          (asserts! (is-eq (get current-custodian s) tx-sender) (err ERR-INVALID-CUSTODY-CHANGE))
          (asserts! (not (is-eq (get current-status s) STATUS-PROCESSED)) (err ERR-ALREADY-PROCESSED))
          (map-set batch-statuses batch-id
            (merge s {
              current-status: STATUS-REJECTED,
              last-update-timestamp: block-height
            })
          )
          (let ((log-count (get-batch-history-count batch-id)))
            (asserts! (< log-count (var-get max-history-per-batch)) (err ERR-MAX-HISTORY-EXCEEDED))
            (map-set batch-history { batch-id: batch-id, log-id: log-count }
              {
                action: u"rejected",
                actor: tx-sender,
                timestamp: block-height,
                proof-hash: proof,
                notes: notes
              }
            )
            (map-set batch-history-count batch-id (+ log-count u1))
          )
          (print { event: "batch-rejected", id: batch-id })
          (ok true)
        )
      (err ERR-BATCH-NOT-FOUND)
    )
  )
)

(define-public (get-full-batch-history (batch-id uint))
  (let ((count (get-batch-history-count batch-id)))
    (ok (map get-batch-history-entry (list batch-id) (unwrap-panic (slice? (range u0 count) u0 count))))
  )
)