import argparse
import json

try:
    from backend.supervised_model import train_supervised_summarizer
except ModuleNotFoundError:
    from supervised_model import train_supervised_summarizer


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the supervised extractive summarizer.")
    parser.add_argument("--train", required=True, help="Path to the training CSV.")
    parser.add_argument("--validation", help="Path to the validation CSV.")
    parser.add_argument("--test", help="Path to the test CSV.")
    parser.add_argument("--max-train-records", type=int, default=20000)
    parser.add_argument("--max-validation-records", type=int, default=3000)
    parser.add_argument("--max-test-records", type=int, default=3000)
    parser.add_argument("--dataset-name", default="default")
    args = parser.parse_args()

    metrics = train_supervised_summarizer(
        train_csv=args.train,
        validation_csv=args.validation,
        test_csv=args.test,
        max_train_records=args.max_train_records,
        max_validation_records=args.max_validation_records,
        max_test_records=args.max_test_records,
        dataset_name=args.dataset_name,
    )
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
